/**
 * tokenCreationService
 *
 * Handles on-chain SPL token creation via the connected wallet.
 * Private keys never leave the user's device — only signed transactions are sent.
 *
 * Single-transaction flow (all instructions in one tx):
 *   1. SystemProgram.createAccount  — allocate mint account
 *   2. InitializeMint               — set decimals + authorities
 *   3. CreateAssociatedTokenAccount — creator ATA
 *   4. MintTo                       — mint full supply to creator ATA
 *   5. CreateMetadataAccountV3      — Metaplex on-chain metadata
 *   6. SystemProgram.transfer       — 0.02 SOL platform fee
 *
 * All RPC calls go through SolanaConnectionService.rpcCall() — a direct HTTP
 * fetch to the Supabase proxy — NOT through the @solana/web3.js Connection
 * object. This avoids the WebSocket connection that Connection always opens
 * (which fails against the Supabase Edge Function proxy) and gives us clean,
 * reliable HTTP-only RPC calls with proper auth headers.
 *
 * The signing service (launchpadSigningService) uses the Connection object
 * only for sendRawTransaction and getSignatureStatuses, both of which are
 * standard HTTP JSON-RPC calls that work fine through the proxy.
 */

import {
  PublicKey,
  Transaction,
  SystemProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
} from '@solana/web3.js';
import { SolanaConnectionService } from './solana/connectionService';
import { launchpadService, CreateTokenInput } from './launchpadService';
import { tokenRegistryService } from './tokenRegistryService';

// ── Program IDs ───────────────────────────────────────────────────────────────
const METADATA_PROGRAM_ID        = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const TOKEN_PROGRAM_ID           = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID      = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bJo');
const SYSTEM_PROGRAM_ID          = new PublicKey('11111111111111111111111111111111');
const SYSVAR_RENT_PUBKEY         = new PublicKey('SysvarRent111111111111111111111111111111111');

// ── Platform fee ──────────────────────────────────────────────────────────────
const PLATFORM_FEE_WALLET  = new PublicKey('FvzoyNk8MSwMgWbiGRbhLASyJSusoVpVtaE2w11WFg2X');
const PLATFORM_FEE_SOL     = 0.02;
const PLATFORM_FEE_LAMPORTS = Math.round(PLATFORM_FEE_SOL * LAMPORTS_PER_SOL);

// Account sizes for rent calculation
// SPL Token mint = 82 bytes; Token-2022 mint base = 234 bytes (82 + extension header)
const MINT_ACCOUNT_SIZE      = 82;
const MINT_ACCOUNT_SIZE_2022 = 234;
const ATA_ACCOUNT_SIZE       = 165;

// ── Types ─────────────────────────────────────────────────────────────────────

export type TokenCreationMode = 'easy' | 'advanced';

export interface EasyModeInput {
  mode: 'easy';
  name: string;
  symbol: string;
  description: string;
  imageUri?: string;
  totalSupply: number;
  website?: string;
  telegram?: string;
  twitter?: string;
  discord?: string;
  initialBuyAmount?: number;
}

export interface AdvancedModeInput {
  mode: 'advanced';
  name: string;
  symbol: string;
  description: string;
  imageUri?: string;
  decimals: number;
  totalSupply: number;
  creatorAllocation: number;
  liquidityAllocation: number;
  website?: string;
  telegram?: string;
  twitter?: string;
  discord?: string;
  useToken2022?: boolean;
  transferFeeBps?: number;
  revokeMintAuthority?: boolean;
  revokeFreezeAuthority?: boolean;
  burnSettings?: boolean;
  presalePrep?: boolean;
  antiBotPrep?: boolean;
}

export type TokenCreationInput = EasyModeInput | AdvancedModeInput;

export interface TokenCreationResult {
  success: boolean;
  mintAddress?: string;
  txSignature?: string;
  tokenId?: string;
  error?: string;
  metadataUri?: string;
}

export interface TokenCreationProgress {
  step: number;
  totalSteps: number;
  label: string;
}

export type ProgressCallback = (progress: TokenCreationProgress) => void;

export interface LaunchCostEstimate {
  networkAndMintCost: number;
  platformFee: number;
  total: number;
}

// ── Input normalizer ──────────────────────────────────────────────────────────

function normalizeInput(input: TokenCreationInput, creatorWallet: string): CreateTokenInput {
  if (input.mode === 'easy') {
    const total = input.totalSupply;
    return {
      name: input.name,
      symbol: input.symbol,
      description: input.description,
      decimals: 6,
      totalSupply: total,
      creatorAllocation: Math.floor(total * 0.1),
      liquidityAllocation: Math.floor(total * 0.9),
      website: input.website,
      telegram: input.telegram,
      twitter: input.twitter,
      discord: input.discord,
      tokenProgram: 'spl-token',
      creatorWallet,
    };
  } else {
    return {
      name: input.name,
      symbol: input.symbol,
      description: input.description,
      decimals: input.decimals,
      totalSupply: input.totalSupply,
      creatorAllocation: input.creatorAllocation,
      liquidityAllocation: input.liquidityAllocation,
      website: input.website,
      telegram: input.telegram,
      twitter: input.twitter,
      discord: input.discord,
      tokenProgram: input.useToken2022 ? 'token-2022' : 'spl-token',
      creatorWallet,
    };
  }
}

// ── RPC helpers (direct HTTP — no Connection object) ─────────────────────────

/**
 * Fetch the minimum lamports for rent exemption via direct JSON-RPC call.
 * Uses SolanaConnectionService.rpcCall() which sends an authorized HTTP POST
 * to the Supabase proxy. Does NOT use the @solana/web3.js Connection object.
 */
async function getRentExemption(dataSize: number): Promise<number> {
  const connSvc = SolanaConnectionService.getInstance();
  const result = await connSvc.rpcCall('getMinimumBalanceForRentExemption', [dataSize]);
  return typeof result === 'number' ? result : Number(result);
}

/**
 * Fetch the latest confirmed blockhash via direct JSON-RPC call.
 */
async function getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
  const connSvc = SolanaConnectionService.getInstance();
  const result = await connSvc.rpcCall('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  return {
    blockhash: result.value.blockhash,
    lastValidBlockHeight: result.value.lastValidBlockHeight,
  };
}

/**
 * Fetch wallet balance in lamports via direct JSON-RPC call.
 */
async function getBalance(pubkey: string): Promise<number> {
  const connSvc = SolanaConnectionService.getInstance();
  const result = await connSvc.rpcCall('getBalance', [pubkey, { commitment: 'confirmed' }]);
  return typeof result === 'object' ? result.value : result;
}

// ── Service ───────────────────────────────────────────────────────────────────

class TokenCreationService {

  /**
   * Full token creation flow — single transaction, direct HTTP RPC only.
   *
   * signAndSendTransaction is provided by launchpadSigningService.
   * It fetches a fresh blockhash, signs with all keypairs, sends via
   * connection.sendRawTransaction(), and polls confirmation via HTTP.
   */
  async createToken(
    input: TokenCreationInput,
    creatorWallet: string,
    signAndSendTransaction: (tx: Transaction, signers?: Keypair[]) => Promise<string>,
    onProgress?: ProgressCallback,
    imageUri?: string
  ): Promise<TokenCreationResult> {
    const STEPS = 7;
    const progress = (step: number, label: string) =>
      onProgress?.({ step, totalSteps: STEPS, label });

    try {
      // ── Step 1: Validate wallet ────────────────────────────────────────────
      progress(1, 'Validating wallet...');

      if (!creatorWallet || creatorWallet.trim().length === 0) {
        return { success: false, error: 'Wallet signer unavailable: no wallet address provided' };
      }

      let creatorPubkey: PublicKey;
      try {
        creatorPubkey = new PublicKey(creatorWallet);
      } catch {
        return { success: false, error: 'Wallet signer unavailable: invalid Solana address' };
      }

      const connSvc = SolanaConnectionService.getInstance();
      console.log('[TokenCreation] ══════════════════════════════════════');
      console.log('[TokenCreation] Creator wallet:', creatorPubkey.toBase58());
      console.log('[TokenCreation] RPC URL:', connSvc.getRpcUrl().slice(0, 80));
      console.log('[TokenCreation] Mode:', connSvc.isUsingProxy() ? 'Supabase proxy' : 'direct');

      const normalized = normalizeInput(input, creatorWallet);

      // ── Step 2: Upload image ────────────────────────────────────────────────
      progress(2, 'Uploading token image...');

      let imageUrl: string | undefined;
      const uri = imageUri ?? (input.mode === 'easy'
        ? input.imageUri
        : (input as AdvancedModeInput).imageUri);
      if (uri) {
        try {
          imageUrl = await launchpadService.uploadImage(creatorWallet, uri) ?? undefined;
          if (imageUrl) {
            console.log('[TokenCreation] Image uploaded:', imageUrl.slice(0, 60));
          } else {
            console.warn('[TokenCreation] Image upload returned null — continuing without image');
          }
        } catch (imgErr: any) {
          console.warn('[TokenCreation] Image upload (non-fatal):', imgErr?.message);
        }
      }

      // ── Step 3: Create DB record (pending) ─────────────────────────────────
      progress(3, 'Creating launch record in database...');

      const { data: record, error: recordError } = await launchpadService.createRecord({
        ...normalized,
        imageUrl,
      });
      if (recordError || !record) {
        const msg = recordError ?? 'Database launch record failed';
        console.error('[TokenCreation] createRecord failed:', msg);
        return { success: false, error: `Database error: ${msg}` };
      }
      console.log('[TokenCreation] DB record created:', record.id);

      // ── Step 4: Upload metadata ─────────────────────────────────────────────
      progress(4, 'Uploading token metadata...');

      let metadataUri: string | undefined;
      try {
        const metadata = {
          name: normalized.name,
          symbol: normalized.symbol,
          description: normalized.description,
          image: imageUrl ?? '',
          external_url: normalized.website ?? '',
          attributes: [],
          properties: {
            files: imageUrl ? [{ uri: imageUrl, type: 'image/png' }] : [],
            category: 'token',
          },
          extensions: {
            website: normalized.website ?? '',
            telegram: normalized.telegram ?? '',
            twitter: normalized.twitter ?? '',
            discord: normalized.discord ?? '',
            creator: creatorWallet,
          },
        };
        metadataUri = await launchpadService.uploadMetadata(metadata, record.id) ?? undefined;
        if (metadataUri) {
          console.log('[TokenCreation] Metadata uploaded:', metadataUri.slice(0, 60));
        } else {
          console.warn('[TokenCreation] Metadata upload returned null — continuing without URI');
        }
      } catch (metaErr: any) {
        console.warn('[TokenCreation] Metadata upload (non-fatal):', metaErr?.message);
      }

      // ── Step 5: RPC connectivity + rent + blockhash ─────────────────────────
      progress(5, 'Connecting to Solana network...');

      // Verify RPC is reachable with a cheap call first
      console.log('[TokenCreation] Verifying RPC connectivity...');
      try {
        const blockHeight = await connSvc.rpcCall('getBlockHeight', []);
        console.log('[TokenCreation] RPC healthy — block height:', blockHeight);
      } catch (healthErr: any) {
        console.error('[TokenCreation] RPC health check failed:', healthErr);
        await launchpadService.updateRecord(record.id, { status: 'failed' });
        return {
          success: false,
          error: `Cannot reach Solana network: ${healthErr?.message || 'RPC unreachable'}`,
          tokenId: record.id,
        };
      }

      let mintRentLamports: number;
      let ataRentLamports: number;
      let blockhash: string;

      try {
        console.log('[TokenCreation] Fetching rent exemptions and blockhash...');
        // All three calls go through direct HTTP, no Connection object
        const mintSize = normalized.tokenProgram === 'token-2022'
          ? MINT_ACCOUNT_SIZE_2022
          : MINT_ACCOUNT_SIZE;
        [mintRentLamports, ataRentLamports] = await Promise.all([
          getRentExemption(mintSize),
          getRentExemption(ATA_ACCOUNT_SIZE),
        ]);
        const bhResult = await getLatestBlockhash();
        blockhash = bhResult.blockhash;
        console.log('[TokenCreation] Mint rent:', mintRentLamports, 'lamports');
        console.log('[TokenCreation] ATA rent:', ataRentLamports, 'lamports');
        console.log('[TokenCreation] Blockhash:', blockhash);
      } catch (rpcErr: any) {
        console.error('[TokenCreation] RPC call failed:', rpcErr);
        await launchpadService.updateRecord(record.id, { status: 'failed' });
        return {
          success: false,
          error: `RPC error: ${rpcErr?.message || 'failed to fetch network state'}`,
          tokenId: record.id,
        };
      }

      // SOL balance check
      const txFeeEstimate = 0.000015;
      const requiredSol =
        (mintRentLamports + ataRentLamports + PLATFORM_FEE_LAMPORTS) / LAMPORTS_PER_SOL +
        txFeeEstimate;

      let balanceSol = 0;
      try {
        const lamports = await getBalance(creatorPubkey.toBase58());
        balanceSol = lamports / LAMPORTS_PER_SOL;
        console.log('[TokenCreation] Wallet balance:', balanceSol.toFixed(6), 'SOL | Required:', requiredSol.toFixed(6), 'SOL');
      } catch (balErr: any) {
        console.warn('[TokenCreation] Balance check (non-fatal):', balErr?.message);
      }

      if (balanceSol > 0 && balanceSol < requiredSol) {
        await launchpadService.updateRecord(record.id, { status: 'failed' });
        return {
          success: false,
          error: `Insufficient SOL: need ≥${requiredSol.toFixed(4)} SOL, wallet has ${balanceSol.toFixed(4)} SOL`,
          tokenId: record.id,
        };
      }

      // ── Step 6: Build single transaction ───────────────────────────────────
      progress(6, 'Building on-chain transaction...');

      const mintKeypair    = Keypair.generate();
      const mintPubkey     = mintKeypair.publicKey;
      const isToken2022    = normalized.tokenProgram === 'token-2022';
      const tokenProgramId = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
      const mintAccountSize = isToken2022 ? MINT_ACCOUNT_SIZE_2022 : MINT_ACCOUNT_SIZE;

      console.log('[TokenCreation] Generated mint keypair:', mintPubkey.toBase58());
      console.log('[TokenCreation] Token program:', normalized.tokenProgram, '| Mint size:', mintAccountSize);

      const ata = await this.deriveAta(creatorPubkey, mintPubkey, tokenProgramId);
      console.log('[TokenCreation] Creator ATA:', ata.toBase58());

      // Use the blockhash we fetched — the signing service will replace it with
      // a fresh one right before signing, ensuring it's never stale.
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: creatorPubkey });

      // 1. Create mint account (SystemProgram allocates space, assigns to token program)
      tx.add(SystemProgram.createAccount({
        fromPubkey: creatorPubkey,
        newAccountPubkey: mintPubkey,
        lamports: mintRentLamports,
        space: mintAccountSize,
        programId: tokenProgramId,
      }));

      // 2. Initialize mint
      tx.add(this.buildInitializeMintIx(
        mintPubkey, normalized.decimals, creatorPubkey, creatorPubkey, tokenProgramId
      ));

      // 3. Create creator ATA
      tx.add(this.buildCreateAtaIx(creatorPubkey, ata, creatorPubkey, mintPubkey, tokenProgramId));

      // 4. Mint creator allocation to ATA
      if (normalized.creatorAllocation > 0) {
        const rawAmount = BigInt(
          Math.floor(normalized.creatorAllocation * Math.pow(10, normalized.decimals))
        );
        tx.add(this.buildMintToIx(mintPubkey, ata, creatorPubkey, rawAmount, tokenProgramId));
        console.log('[TokenCreation] MintTo amount:', rawAmount.toString(), 'raw units');
      }

      // 5. Metaplex metadata
      if (metadataUri) {
        const metaIx = this.buildMetaplexMetadataIx(
          mintPubkey, creatorPubkey, normalized.name, normalized.symbol, metadataUri
        );
        if (metaIx) {
          tx.add(metaIx);
          console.log('[TokenCreation] Metaplex metadata instruction added');
        }
      }

      // 6. Platform fee transfer — if this instruction fails, the ENTIRE tx fails
      tx.add(SystemProgram.transfer({
        fromPubkey: creatorPubkey,
        toPubkey: PLATFORM_FEE_WALLET,
        lamports: PLATFORM_FEE_LAMPORTS,
      }));

      console.log('[TokenCreation] Transaction built:', tx.instructions.length, 'instructions');
      console.log('[TokenCreation] Platform fee:', PLATFORM_FEE_SOL, 'SOL →', PLATFORM_FEE_WALLET.toBase58());

      // ── Step 7: Sign, send, confirm ──────────────────────────────────────────
      // The signing service fetches a FRESH blockhash before signing so the
      // blockhash we set above is only a placeholder — it will be replaced.
      // mintKeypair is passed as extraSigner so the service signs with both keys.
      progress(7, 'Waiting for wallet signature...');
      console.log('[TokenCreation] Requesting wallet signature...');

      let txSignature: string;
      try {
        txSignature = await signAndSendTransaction(tx, [mintKeypair]);
      } catch (err: any) {
        console.error('[TokenCreation] Transaction failed:', err?.message);
        console.error('[TokenCreation] Full error:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
        await launchpadService.updateRecord(record.id, { status: 'failed' });

        const raw = err?.message || String(err);
        let msg: string;
        if (raw.includes('blockhash') || raw.includes('BlockhashNotFound'))
          msg = 'Blockhash expired — please retry';
        else if (raw.includes('0x1') || raw.includes('insufficient lamports') || raw.includes('Insufficient'))
          msg = `Insufficient SOL to cover transaction fees (need ~${requiredSol.toFixed(4)} SOL)`;
        else if (raw.includes('rejected') || raw.includes('cancelled') || raw.includes('denied') || raw.includes('User rejected'))
          msg = 'Transaction cancelled — wallet rejected the signature request';
        else if (raw.includes('timeout') || raw.includes('timed out'))
          msg = 'RPC timeout — Solana network is congested, please retry';
        else if (raw.includes('simulation'))
          msg = `Transaction simulation failed: ${raw}`;
        else
          msg = `Transaction failed: ${raw}`;

        return { success: false, error: msg, tokenId: record.id };
      }

      console.log('[TokenCreation] Transaction confirmed:', txSignature);

      // ── Save to DB ──────────────────────────────────────────────────────────
      await launchpadService.updateRecord(record.id, {
        mint_address: mintPubkey.toBase58(),
        status: 'deployed',
        creation_tx: txSignature,
        metadata_uri: metadataUri,
        image_url: imageUrl,
      });

      await launchpadService.recordLaunchTransaction(
        record.id, creatorWallet, txSignature, PLATFORM_FEE_SOL
      );

      await tokenRegistryService.registerWalletMints([mintPubkey.toBase58()]).catch(() => {});

      return {
        success: true,
        mintAddress: mintPubkey.toBase58(),
        txSignature,
        tokenId: record.id,
        metadataUri,
      };

    } catch (err: any) {
      console.error('[TokenCreationService] Unexpected error:', err);
      return { success: false, error: err?.message || 'Unexpected error during token creation' };
    }
  }

  /** Fetch real cost estimate for the UI cost card */
  async estimateLaunchCost(): Promise<LaunchCostEstimate> {
    try {
      const [mintRent, ataRent] = await Promise.all([
        getRentExemption(MINT_ACCOUNT_SIZE),
        getRentExemption(ATA_ACCOUNT_SIZE),
      ]);
      const networkAndMintCost = (mintRent + ataRent) / LAMPORTS_PER_SOL + 0.000015;
      return {
        networkAndMintCost,
        platformFee: PLATFORM_FEE_SOL,
        total: networkAndMintCost + PLATFORM_FEE_SOL,
      };
    } catch {
      return { networkAndMintCost: 0.00386, platformFee: PLATFORM_FEE_SOL, total: 0.02386 };
    }
  }

  // ── Instruction builders ────────────────────────────────────────────────────

  private buildInitializeMintIx(
    mint: PublicKey,
    decimals: number,
    mintAuthority: PublicKey,
    freezeAuthority: PublicKey | null,
    programId: PublicKey
  ): TransactionInstruction {
    const hasFreezeAuth = freezeAuthority !== null;
    const dataLen = 2 + 32 + 1 + (hasFreezeAuth ? 32 : 0);
    const data = Buffer.alloc(dataLen);
    let offset = 0;

    data.writeUInt8(0, offset++);
    data.writeUInt8(decimals, offset++);
    mintAuthority.toBuffer().copy(data, offset); offset += 32;

    if (hasFreezeAuth) {
      data.writeUInt8(1, offset++);
      freezeAuthority!.toBuffer().copy(data, offset);
    } else {
      data.writeUInt8(0, offset);
    }

    return new TransactionInstruction({
      keys: [
        { pubkey: mint,             isSigner: false, isWritable: true  },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId,
      data,
    });
  }

  /**
   * ATA program v1.1+ CreateAssociatedTokenAccount instruction.
   *
   * Account order (6 accounts — SysvarRent was removed in v1.1+):
   *   0. payer          — funds the account, signer, writable
   *   1. ata            — the new ATA address, writable (not a signer — derived PDA)
   *   2. owner          — wallet that will own the tokens, not a signer
   *   3. mint           — the token mint
   *   4. system_program — for account creation
   *   5. token_program  — SPL Token or Token-2022
   *
   * data = [] (0 bytes) = CreateAssociatedTokenAccount (fails if already exists)
   * data = [1] = CreateAssociatedTokenAccountIdempotent (succeeds if exists)
   */
  private buildCreateAtaIx(
    payer: PublicKey,
    ata: PublicKey,
    owner: PublicKey,
    mint: PublicKey,
    tokenProgramId: PublicKey
  ): TransactionInstruction {
    return new TransactionInstruction({
      keys: [
        { pubkey: payer,             isSigner: true,  isWritable: true  },
        { pubkey: ata,               isSigner: false, isWritable: true  },
        { pubkey: owner,             isSigner: false, isWritable: false },
        { pubkey: mint,              isSigner: false, isWritable: false },
        { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: tokenProgramId,    isSigner: false, isWritable: false },
      ],
      programId: ASSOCIATED_TOKEN_PROGRAM_ID,
      data: Buffer.alloc(0),
    });
  }

  private buildMintToIx(
    mint: PublicKey,
    destination: PublicKey,
    mintAuthority: PublicKey,
    amount: bigint,
    programId: PublicKey
  ): TransactionInstruction {
    const data = Buffer.alloc(9);
    data.writeUInt8(7, 0);
    data.writeBigUInt64LE(amount, 1);
    return new TransactionInstruction({
      keys: [
        { pubkey: mint,          isSigner: false, isWritable: true  },
        { pubkey: destination,   isSigner: false, isWritable: true  },
        { pubkey: mintAuthority, isSigner: true,  isWritable: false },
      ],
      programId,
      data,
    });
  }

  private buildMetaplexMetadataIx(
    mint: PublicKey,
    updateAuthority: PublicKey,
    name: string,
    symbol: string,
    uri: string
  ): TransactionInstruction | null {
    try {
      const [metadataPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
        METADATA_PROGRAM_ID
      );

      const nameBytes   = Buffer.from(name.slice(0, 32), 'utf8');
      const symbolBytes = Buffer.from(symbol.slice(0, 10), 'utf8');
      const uriBytes    = Buffer.from(uri.slice(0, 200), 'utf8');

      const dataLen =
        8 + 4 + nameBytes.length + 4 + symbolBytes.length + 4 + uriBytes.length +
        2 + 1 + 1 + 1 + 1 + 1;

      const data = Buffer.alloc(dataLen);
      let offset = 0;

      [33, 241, 65, 62, 238, 85, 214, 203].forEach(b => { data.writeUInt8(b, offset++); });
      data.writeUInt32LE(nameBytes.length, offset);   offset += 4;
      nameBytes.copy(data, offset);                   offset += nameBytes.length;
      data.writeUInt32LE(symbolBytes.length, offset); offset += 4;
      symbolBytes.copy(data, offset);                 offset += symbolBytes.length;
      data.writeUInt32LE(uriBytes.length, offset);    offset += 4;
      uriBytes.copy(data, offset);                    offset += uriBytes.length;
      data.writeUInt16LE(0, offset);                  offset += 2;
      data.writeUInt8(0, offset++); // creators = None
      data.writeUInt8(0, offset++); // collection = None
      data.writeUInt8(0, offset++); // uses = None
      data.writeUInt8(1, offset++); // is_mutable = true
      data.writeUInt8(0, offset++); // collection_details = None

      return new TransactionInstruction({
        keys: [
          { pubkey: metadataPda,     isSigner: false, isWritable: true  },
          { pubkey: mint,            isSigner: false, isWritable: false },
          { pubkey: updateAuthority, isSigner: true,  isWritable: false },
          { pubkey: updateAuthority, isSigner: true,  isWritable: true  },
          { pubkey: updateAuthority, isSigner: false, isWritable: false },
          { pubkey: SYSTEM_PROGRAM_ID,  isSigner: false, isWritable: false },
          { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        ],
        programId: METADATA_PROGRAM_ID,
        data,
      });
    } catch {
      return null;
    }
  }

  private async deriveAta(
    owner: PublicKey,
    mint: PublicKey,
    tokenProgramId: PublicKey = TOKEN_PROGRAM_ID
  ): Promise<PublicKey> {
    const [ata] = await PublicKey.findProgramAddress(
      [owner.toBuffer(), tokenProgramId.toBuffer(), mint.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    return ata;
  }
}

export const tokenCreationService = new TokenCreationService();
