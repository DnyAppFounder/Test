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
 * The mint keypair partialSigns first; the user wallet signs as fee payer.
 */

import {
  Connection,
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
const METADATA_PROGRAM_ID     = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const TOKEN_PROGRAM_ID        = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID   = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bJo');
const SYSTEM_PROGRAM_ID       = new PublicKey('11111111111111111111111111111111');
const SYSVAR_RENT_PUBKEY      = new PublicKey('SysvarRent111111111111111111111111111111111');

// ── Platform fee ──────────────────────────────────────────────────────────────
const PLATFORM_FEE_WALLET = new PublicKey('FvzoyNk8MSwMgWbiGRbhLASyJSusoVpVtaE2w11WFg2X');
const PLATFORM_FEE_SOL    = 0.02;
const PLATFORM_FEE_LAMPORTS = Math.round(PLATFORM_FEE_SOL * LAMPORTS_PER_SOL);

// Account sizes for rent calculation
const MINT_ACCOUNT_SIZE     = 82;
const ATA_ACCOUNT_SIZE      = 165;

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
  networkAndMintCost: number; // SOL — mint rent + ATA rent + tx fees
  platformFee: number;        // SOL — always 0.02
  total: number;              // SOL
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

// ── Service ───────────────────────────────────────────────────────────────────

class TokenCreationService {
  private connection: Connection;

  constructor() {
    this.connection = SolanaConnectionService.getInstance().getConnection();
  }

  /**
   * Full token creation flow — single transaction.
   *
   * `signAndSendTransaction` is provided by launchpadSigningService.
   * It receives the Transaction plus extraSigners (mintKeypair), signs with all
   * keys, sends the raw transaction, and polls confirmation over HTTP.
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
      } catch (e) {
        console.error('[TokenCreation] Invalid wallet address:', e);
        return { success: false, error: 'Wallet signer unavailable: invalid Solana address' };
      }

      const connSvc = SolanaConnectionService.getInstance();
      console.log('[TokenCreation] ══════════════════════════════════════');
      console.log('[TokenCreation] Creator wallet:', creatorPubkey.toBase58());
      console.log('[TokenCreation] RPC URL:', connSvc.getRpcUrl().slice(0, 80));
      console.log('[TokenCreation] Mode:', connSvc.isUsingProxy() ? 'Supabase proxy' : 'direct');
      console.log('[TokenCreation] ══════════════════════════════════════');

      const normalized = normalizeInput(input, creatorWallet);

      // ── Step 2: Upload image ────────────────────────────────────────────────
      progress(2, 'Uploading token image...');

      let imageUrl: string | undefined;
      const uri = imageUri ?? (input.mode === 'easy' ? input.imageUri : (input as AdvancedModeInput).imageUri);
      if (uri) {
        try {
          imageUrl = await launchpadService.uploadImage(creatorWallet, uri) ?? undefined;
          if (!imageUrl) {
            console.warn('[TokenCreation] Image upload returned null — continuing without image');
          } else {
            console.log('[TokenCreation] Image uploaded:', imageUrl.slice(0, 60));
          }
        } catch (imgErr: any) {
          console.warn('[TokenCreation] Image upload threw (non-fatal):', imgErr?.message);
        }
      }

      // ── Step 3: Create DB record (pending) ─────────────────────────────────
      progress(3, 'Creating launch record in database...');

      const { data: record, error: recordError } = await launchpadService.createRecord({
        ...normalized,
        imageUrl,
      });
      if (recordError || !record) {
        const msg = recordError ?? 'Database launch record failed — no record returned';
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
        if (!metadataUri) {
          console.warn('[TokenCreation] Metadata upload returned null — continuing without metadata URI');
        } else {
          console.log('[TokenCreation] Metadata uploaded:', metadataUri.slice(0, 60));
        }
      } catch (metaErr: any) {
        console.warn('[TokenCreation] Metadata upload threw (non-fatal):', metaErr?.message);
      }

      // ── Step 5: RPC connectivity check + rent + blockhash ──────────────────
      progress(5, 'Connecting to Solana network...');

      let mintRentLamports: number;
      let ataRentLamports: number;
      let blockhash: string;
      let lastValidBlockHeight: number;

      // Verify RPC is reachable before anything else
      console.log('[TokenCreation] Verifying RPC connectivity...');
      try {
        const blockHeight = await connSvc.rpcCall('getBlockHeight', []);
        console.log('[TokenCreation] RPC healthy — block height:', blockHeight);
      } catch (healthErr: any) {
        console.error('[TokenCreation] RPC health check failed:', healthErr);
        await launchpadService.updateRecord(record.id, { status: 'failed' });
        return {
          success: false,
          error: `RPC connection failed: ${healthErr?.message || 'cannot reach Solana network'}`,
          tokenId: record.id,
        };
      }

      try {
        console.log('[TokenCreation] Fetching rent exemption values...');
        [mintRentLamports, ataRentLamports] = await Promise.all([
          this.connection.getMinimumBalanceForRentExemption(MINT_ACCOUNT_SIZE),
          this.connection.getMinimumBalanceForRentExemption(ATA_ACCOUNT_SIZE),
        ]);
        console.log('[TokenCreation] Mint rent:', mintRentLamports, 'lamports');
        console.log('[TokenCreation] ATA rent:', ataRentLamports, 'lamports');

        console.log('[TokenCreation] Fetching latest blockhash...');
        const bhResult = await this.connection.getLatestBlockhash('confirmed');
        blockhash = bhResult.blockhash;
        lastValidBlockHeight = bhResult.lastValidBlockHeight;
        console.log('[TokenCreation] Blockhash:', blockhash, '| lastValidBlockHeight:', lastValidBlockHeight);
      } catch (rpcErr: any) {
        console.error('[TokenCreation] RPC call failed:', rpcErr);
        console.error('[TokenCreation] Full RPC error:', JSON.stringify(rpcErr, null, 2));
        await launchpadService.updateRecord(record.id, { status: 'failed' });
        return {
          success: false,
          error: `RPC error: ${rpcErr?.message || 'failed to fetch network state'}`,
          tokenId: record.id,
        };
      }

      // SOL balance check
      const txFeeEstimate = 0.000015; // ~3 signatures × 5000 lamports
      const requiredSol =
        (mintRentLamports + ataRentLamports + PLATFORM_FEE_LAMPORTS) / LAMPORTS_PER_SOL +
        txFeeEstimate;

      let balanceSol = 0;
      try {
        const lamports = await this.connection.getBalance(creatorPubkey, 'confirmed');
        balanceSol = lamports / LAMPORTS_PER_SOL;
        console.log('[TokenCreation] Wallet balance:', balanceSol.toFixed(6), 'SOL | Required:', requiredSol.toFixed(6), 'SOL');
      } catch (balErr: any) {
        console.warn('[TokenCreation] Balance check failed (non-fatal):', balErr?.message);
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

      const mintKeypair = Keypair.generate();
      const mintPubkey = mintKeypair.publicKey;
      const tokenProgramId = normalized.tokenProgram === 'token-2022'
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;

      console.log('[TokenCreation] Generated mint keypair:', mintPubkey.toBase58());
      console.log('[TokenCreation] Token program:', normalized.tokenProgram);

      // Derive ATA from public key — no RPC call needed
      const ata = await this.deriveAta(creatorPubkey, mintPubkey, tokenProgramId);
      console.log('[TokenCreation] Creator ATA:', ata.toBase58());

      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: creatorPubkey });

      // 1. Create mint account
      tx.add(SystemProgram.createAccount({
        fromPubkey: creatorPubkey,
        newAccountPubkey: mintPubkey,
        lamports: mintRentLamports,
        space: MINT_ACCOUNT_SIZE,
        programId: tokenProgramId,
      }));

      // 2. Initialize mint
      tx.add(this.buildInitializeMintIx(
        mintPubkey, normalized.decimals, creatorPubkey, creatorPubkey, tokenProgramId
      ));

      // 3. Create creator ATA
      tx.add(this.buildCreateAtaIx(creatorPubkey, ata, creatorPubkey, mintPubkey, tokenProgramId));

      // 4. Mint full creator allocation to ATA
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

      // 6. Platform fee transfer — FATAL if fails (entire tx rejects)
      tx.add(SystemProgram.transfer({
        fromPubkey: creatorPubkey,
        toPubkey: PLATFORM_FEE_WALLET,
        lamports: PLATFORM_FEE_LAMPORTS,
      }));

      console.log('[TokenCreation] Transaction built:', tx.instructions.length, 'instructions');
      console.log('[TokenCreation] Platform fee:', PLATFORM_FEE_SOL, 'SOL →', PLATFORM_FEE_WALLET.toBase58());
      console.log('[TokenCreation] feePayer:', creatorPubkey.toBase58());
      console.log('[TokenCreation] recentBlockhash:', blockhash);

      // ── Simulate transaction ─────────────────────────────────────────────────
      // partialSign with mintKeypair so simulation has a valid sig for it.
      // The signer will re-sign everything with a fresh blockhash before sending.
      console.log('[TokenCreation] Simulating transaction...');
      try {
        tx.partialSign(mintKeypair);

        // simulateTransaction(tx, signers) — pass empty array to skip sig verification
        // which lets us simulate without the fee-payer signature
        const simResult = await this.connection.simulateTransaction(tx);
        const simLogs = simResult.value.logs ?? [];
        console.log('[TokenCreation] Simulation result err:', simResult.value.err ?? 'none');
        console.log('[TokenCreation] Simulation logs:', simLogs);

        if (simResult.value.err) {
          const simErr = JSON.stringify(simResult.value.err);
          const logHint = simLogs.find(l =>
            l.includes('Error') || l.includes('failed') || l.includes('insufficient')
          ) ?? '';
          console.error('[TokenCreation] Simulation failed. Error:', simErr);
          console.error('[TokenCreation] Simulation logs:', simLogs);
          await launchpadService.updateRecord(record.id, { status: 'failed' });
          return {
            success: false,
            error: `Transaction simulation failed: ${logHint || simErr}`,
            tokenId: record.id,
          };
        }
        console.log('[TokenCreation] Simulation passed');
      } catch (simErr: any) {
        // Non-fatal — some RPC endpoints don't support simulation fully
        console.warn('[TokenCreation] Simulation threw (non-fatal, proceeding):', simErr?.message);
      }

      // ── Step 7: Sign, send, confirm ──────────────────────────────────────────
      progress(7, 'Waiting for wallet signature...');
      console.log('[TokenCreation] Requesting wallet signature...');

      let txSignature: string;
      try {
        // mintKeypair is extraSigner — signing service signs with both keypairs + fresh blockhash
        txSignature = await signAndSendTransaction(tx, [mintKeypair]);
      } catch (err: any) {
        console.error('[TokenCreation] Transaction failed:', err);
        console.error('[TokenCreation] Full error object:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
        await launchpadService.updateRecord(record.id, { status: 'failed' });

        const raw = err?.message || String(err);
        let friendlyMsg: string;
        if (raw.includes('blockhash') || raw.includes('BlockhashNotFound'))
          friendlyMsg = 'Blockhash expired — please retry';
        else if (raw.includes('0x1') || raw.includes('insufficient lamports') || raw.includes('Insufficient'))
          friendlyMsg = `Insufficient SOL to cover transaction fees (need ~${requiredSol.toFixed(4)} SOL)`;
        else if (raw.includes('rejected') || raw.includes('cancelled') || raw.includes('denied') || raw.includes('User rejected'))
          friendlyMsg = 'Transaction cancelled — wallet rejected the signature request';
        else if (raw.includes('timeout') || raw.includes('timed out'))
          friendlyMsg = 'RPC timeout — Solana network is congested, please retry';
        else if (raw.includes('simulation'))
          friendlyMsg = `Transaction simulation failed: ${raw}`;
        else
          friendlyMsg = `Transaction failed: ${raw}`;

        return {
          success: false,
          error: friendlyMsg,
          tokenId: record.id,
        };
      }

      console.log('[TokenCreation] ✓ Transaction confirmed. Signature:', txSignature);

      // ── Save confirmed launch to DB ─────────────────────────────────────────
      await launchpadService.updateRecord(record.id, {
        mint_address: mintPubkey.toBase58(),
        status: 'deployed',
        creation_tx: txSignature,
        metadata_uri: metadataUri,
        image_url: imageUrl,
      });

      // Record the launch transaction
      await launchpadService.recordLaunchTransaction(
        record.id, creatorWallet, txSignature, PLATFORM_FEE_SOL
      );

      // Register in global token registry
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

  /** Fetch real rent values and compute the cost breakdown shown in the UI */
  async estimateLaunchCost(): Promise<LaunchCostEstimate> {
    try {
      const [mintRent, ataRent] = await Promise.all([
        this.connection.getMinimumBalanceForRentExemption(MINT_ACCOUNT_SIZE),
        this.connection.getMinimumBalanceForRentExemption(ATA_ACCOUNT_SIZE),
      ]);
      const networkAndMintCost = (mintRent + ataRent) / LAMPORTS_PER_SOL + 0.000015;
      return {
        networkAndMintCost,
        platformFee: PLATFORM_FEE_SOL,
        total: networkAndMintCost + PLATFORM_FEE_SOL,
      };
    } catch {
      // Fallback values if RPC is unreachable
      return {
        networkAndMintCost: 0.00386,
        platformFee: PLATFORM_FEE_SOL,
        total: 0.02386,
      };
    }
  }

  // ── Instruction builders ────────────────────────────────────────────────────

  /** SPL Token InitializeMint — instruction index 0 */
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

    data.writeUInt8(0, offset++);           // instruction = InitializeMint
    data.writeUInt8(decimals, offset++);
    mintAuthority.toBuffer().copy(data, offset); offset += 32;

    if (hasFreezeAuth) {
      data.writeUInt8(1, offset++);         // Option::Some
      freezeAuthority!.toBuffer().copy(data, offset);
    } else {
      data.writeUInt8(0, offset);           // Option::None
    }

    return new TransactionInstruction({
      keys: [
        { pubkey: mint,                       isSigner: false, isWritable: true  },
        { pubkey: SYSVAR_RENT_PUBKEY,         isSigner: false, isWritable: false },
      ],
      programId,
      data,
    });
  }

  /** Create Associated Token Account — ATA program v1 (instruction byte = none, inferred) */
  private buildCreateAtaIx(
    payer: PublicKey,
    ata: PublicKey,
    owner: PublicKey,
    mint: PublicKey,
    tokenProgramId: PublicKey
  ): TransactionInstruction {
    return new TransactionInstruction({
      keys: [
        { pubkey: payer,           isSigner: true,  isWritable: true  },
        { pubkey: ata,             isSigner: false, isWritable: true  },
        { pubkey: owner,           isSigner: false, isWritable: false },
        { pubkey: mint,            isSigner: false, isWritable: false },
        { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: tokenProgramId,  isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId: ASSOCIATED_TOKEN_PROGRAM_ID,
      data: Buffer.alloc(0),
    });
  }

  /** SPL Token MintTo — instruction index 7 */
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

  /**
   * Metaplex create_metadata_account_v3 (Anchor discriminator 8 bytes).
   * Account order matches the Metaplex program interface exactly.
   * Returns null on any encoding error — metadata is non-fatal.
   */
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

      // DataV2 borsh encoding + CreateMetadataAccountArgsV3
      const dataLen =
        8 +                          // Anchor discriminator
        4 + nameBytes.length +       // name
        4 + symbolBytes.length +     // symbol
        4 + uriBytes.length +        // uri
        2 +                          // seller_fee_basis_points
        1 +                          // creators Option::None
        1 +                          // collection Option::None
        1 +                          // uses Option::None
        1 +                          // is_mutable
        1;                           // collection_details Option::None

      const data = Buffer.alloc(dataLen);
      let offset = 0;

      // Anchor discriminator for create_metadata_account_v3
      [33, 241, 65, 62, 238, 85, 214, 203].forEach(b => { data.writeUInt8(b, offset++); });

      data.writeUInt32LE(nameBytes.length, offset);   offset += 4;
      nameBytes.copy(data, offset);                   offset += nameBytes.length;
      data.writeUInt32LE(symbolBytes.length, offset); offset += 4;
      symbolBytes.copy(data, offset);                 offset += symbolBytes.length;
      data.writeUInt32LE(uriBytes.length, offset);    offset += 4;
      uriBytes.copy(data, offset);                    offset += uriBytes.length;
      data.writeUInt16LE(0, offset);                  offset += 2; // seller_fee_basis_points
      data.writeUInt8(0, offset++); // creators = None
      data.writeUInt8(0, offset++); // collection = None
      data.writeUInt8(0, offset++); // uses = None
      data.writeUInt8(1, offset++); // is_mutable = true
      data.writeUInt8(0, offset++); // collection_details = None

      return new TransactionInstruction({
        keys: [
          { pubkey: metadataPda,    isSigner: false, isWritable: true  }, // metadata PDA
          { pubkey: mint,           isSigner: false, isWritable: false }, // mint
          { pubkey: updateAuthority, isSigner: true, isWritable: false }, // mint authority (signer)
          { pubkey: updateAuthority, isSigner: true, isWritable: true  }, // payer (signer, writable)
          { pubkey: updateAuthority, isSigner: false, isWritable: false }, // update authority
          { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        ],
        programId: METADATA_PROGRAM_ID,
        data,
      });
    } catch {
      return null;
    }
  }

  /** Derive ATA address (no RPC call needed) */
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
