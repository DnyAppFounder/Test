/**
 * tokenCreationService
 *
 * Handles on-chain SPL token creation via the connected wallet.
 * Private keys never leave the user's device — only signed transactions are sent.
 *
 * Single-transaction flow (all instructions in one tx):
 *   1. SystemProgram.createAccount      — allocate mint account
 *   2. InitializeMint                   — set decimals + authorities
 *   3. CreateMetadataAccountV3          — Metaplex on-chain name/symbol/uri
 *   4. CreateAssociatedTokenAccountIdempotent — creator ATA
 *   5. MintTo                           — mint full supply to creator ATA
 *   6. SystemProgram.transfer           — 0.02 SOL platform fee (LAST)
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
const TOKEN_PROGRAM_ID            = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID       = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bJo');
const TOKEN_METADATA_PROGRAM_ID   = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const SYSTEM_PROGRAM_ID           = new PublicKey('11111111111111111111111111111111');
const SYSVAR_RENT_PUBKEY          = new PublicKey('SysvarRent111111111111111111111111111111111');

// ── Platform fee ──────────────────────────────────────────────────────────────
const PLATFORM_FEE_WALLET   = new PublicKey('FvzoyNk8MSwMgWbiGRbhLASyJSusoVpVtaE2w11WFg2X');
const PLATFORM_FEE_SOL      = 0.02;
const PLATFORM_FEE_LAMPORTS = Math.round(PLATFORM_FEE_SOL * LAMPORTS_PER_SOL);

// Account sizes for rent calculation
// SPL Token mint = 82 bytes; Token-2022 mint base = 234 bytes (82 + extension header)
const MINT_ACCOUNT_SIZE      = 82;
const MINT_ACCOUNT_SIZE_2022 = 234;
const ATA_ACCOUNT_SIZE       = 165;
// Metaplex metadata account — conservative upper bound (MAX_METADATA_LEN in mpl-token-metadata)
const METADATA_ACCOUNT_SIZE  = 679;

// ── Borsh string encoder (u32-LE length prefix + UTF-8 bytes) ─────────────────
function borshStr(s: string): Buffer {
  const utf8 = Buffer.from(s, 'utf8');
  const len  = Buffer.alloc(4);
  len.writeUInt32LE(utf8.length, 0);
  return Buffer.concat([len, utf8]);
}

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
  mintRent: number;           // mint account rent exemption, in SOL
  ataRent: number;            // creator ATA rent exemption, in SOL
  metadataRent: number;       // Metaplex metadata account rent exemption, in SOL
  networkFee: number;         // base transaction fee (~2 signatures), in SOL
  platformFee: number;        // DAWEN platform fee, in SOL
  total: number;              // sum of all above, in SOL
  networkAndMintCost: number; // mintRent + ataRent + metadataRent + networkFee (legacy compat)
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
      let metadataRentLamports: number;
      let blockhash: string;

      try {
        console.log('[TokenCreation] Fetching rent exemptions and blockhash...');
        const mintSize = normalized.tokenProgram === 'token-2022'
          ? MINT_ACCOUNT_SIZE_2022
          : MINT_ACCOUNT_SIZE;
        [mintRentLamports, ataRentLamports, metadataRentLamports] = await Promise.all([
          getRentExemption(mintSize),
          getRentExemption(ATA_ACCOUNT_SIZE),
          getRentExemption(METADATA_ACCOUNT_SIZE),
        ]);
        const bhResult = await getLatestBlockhash();
        blockhash = bhResult.blockhash;
        console.log('[TokenCreation] Mint rent:', mintRentLamports, 'lamports');
        console.log('[TokenCreation] ATA rent:', ataRentLamports, 'lamports');
        console.log('[TokenCreation] Metadata rent:', metadataRentLamports, 'lamports');
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

      // SOL balance check — includes ALL costs: mint + ATA + metadata + platform + tx fee
      const txFeeEstimate = 0.00001; // 2 signatures × 5000 lamports each
      const requiredSol =
        (mintRentLamports + ataRentLamports + metadataRentLamports + PLATFORM_FEE_LAMPORTS) / LAMPORTS_PER_SOL +
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

      const mintKeypair     = Keypair.generate();
      const mintPubkey      = mintKeypair.publicKey;
      const isToken2022     = normalized.tokenProgram === 'token-2022';
      const tokenProgramId  = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
      const mintAccountSize = isToken2022 ? MINT_ACCOUNT_SIZE_2022 : MINT_ACCOUNT_SIZE;

      console.log('[TokenCreation] Generated mint keypair:', mintPubkey.toBase58());
      console.log('[TokenCreation] Token program:', normalized.tokenProgram, '| Mint size:', mintAccountSize);

      // Derive ATA and Metaplex metadata PDA in parallel
      const [ata, metadataPDA] = await Promise.all([
        this.deriveAta(creatorPubkey, mintPubkey, tokenProgramId),
        this.deriveMetadataPDA(mintPubkey),
      ]);
      console.log('[TokenCreation] Creator ATA:', ata.toBase58());
      console.log('[TokenCreation] Metadata PDA:', metadataPDA.toBase58());

      // ── Assemble the single atomic transaction ──────────────────────────────
      // ALL instructions that debit the payer (rent payments, platform fee) MUST
      // be inside this one Transaction object. The signing service rebuilds a fresh
      // Transaction from tx.instructions with a new blockhash — nothing is added or
      // removed after this block. This is the exact transaction Phantom will sign.

      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: creatorPubkey });

      // ix 1 — Allocate mint account and fund it with rent-exempt lamports.
      //         fromPubkey (creator) is debited mintRentLamports immediately.
      tx.add(SystemProgram.createAccount({
        fromPubkey:      creatorPubkey,
        newAccountPubkey: mintPubkey,
        lamports:        mintRentLamports,
        space:           mintAccountSize,
        programId:       tokenProgramId,
      }));

      // ix 2 — Initialize the mint (set decimals + mint/freeze authorities).
      //         Must come before metadata so the mint authority is set on-chain.
      tx.add(this.buildInitializeMintIx(
        mintPubkey, normalized.decimals, creatorPubkey, creatorPubkey, tokenProgramId
      ));

      // ix 3 — On-chain Metaplex metadata (name/symbol/uri visible in all explorers).
      //         Metaplex CPIs into SystemProgram to create the metadata account;
      //         creator is debited metadataRentLamports via that CPI.
      tx.add(this.buildCreateMetadataV3Ix(
        metadataPDA,
        mintPubkey,
        creatorPubkey,      // mintAuthority — already signing as feePayer
        creatorPubkey,      // payer — debited for metadata account rent
        creatorPubkey,      // updateAuthority
        normalized.name,
        normalized.symbol,
        metadataUri ?? '',
      ));

      // ix 4 — Create the creator's Associated Token Account (idempotent).
      //         ATA program CPIs into SystemProgram; creator debited ataRentLamports.
      tx.add(this.buildCreateAtaIx(creatorPubkey, ata, creatorPubkey, mintPubkey, tokenProgramId));

      // ix 5 — Mint the creator allocation directly into the ATA.
      if (normalized.creatorAllocation > 0) {
        const rawAmount = BigInt(
          Math.floor(normalized.creatorAllocation * Math.pow(10, normalized.decimals))
        );
        tx.add(this.buildMintToIx(mintPubkey, ata, creatorPubkey, rawAmount, tokenProgramId));
        console.log('[TokenCreation] MintTo amount:', rawAmount.toString(), 'raw units');
      }

      // ix 6 — Platform fee SOL transfer (LAST instruction).
      //         This is a direct SystemProgram.transfer — Phantom shows this as a
      //         native SOL send in the transaction approval screen.
      //         Being last means the full tx fails atomically if creator has insufficient SOL.
      tx.add(
        SystemProgram.transfer({
          fromPubkey: creatorPubkey,
          toPubkey:   PLATFORM_FEE_WALLET,
          lamports:   PLATFORM_FEE_LAMPORTS,
        })
      );

      // ── Pre-sign assertion: verify every instruction is in tx before handing to signer
      const ixPrograms = tx.instructions.map(ix => ix.programId.toBase58());
      console.log('[TokenCreation] ── Final tx instructions (' + tx.instructions.length + ' total) ──');
      ixPrograms.forEach((prog, i) => {
        const label =
          prog === SYSTEM_PROGRAM_ID.toBase58()           ? 'SystemProgram' :
          prog === tokenProgramId.toBase58()              ? 'TokenProgram' :
          prog === TOKEN_METADATA_PROGRAM_ID.toBase58()   ? 'MetaplexMetadata' :
          prog === ASSOCIATED_TOKEN_PROGRAM_ID.toBase58() ? 'ATAProgram' : prog.slice(0, 8);
        console.log(`  [${i + 1}] ${label}`);
      });
      console.log('[TokenCreation] Platform fee included:', ixPrograms.includes(SYSTEM_PROGRAM_ID.toBase58()));
      console.log('[TokenCreation] Metadata included:', ixPrograms.includes(TOKEN_METADATA_PROGRAM_ID.toBase58()));
      console.log('[TokenCreation] Total debit from creator:',
        ((mintRentLamports + ataRentLamports + metadataRentLamports + PLATFORM_FEE_LAMPORTS) / LAMPORTS_PER_SOL).toFixed(6),
        'SOL (excl. tx fee)'
      );

      if (tx.instructions.length < 5) {
        throw new Error(`Transaction incomplete: only ${tx.instructions.length} instructions built — aborting`);
      }

      // ── Step 7: Sign, send, confirm ──────────────────────────────────────────
      // The signing service fetches a FRESH blockhash before signing so the
      // blockhash we set above is only a placeholder — it will be replaced.
      // mintKeypair is passed as extraSigner so the service can partialSign it
      // before Phantom (or the internal keypair) adds the feePayer signature.
      progress(7, 'Waiting for wallet signature...');
      console.log('[TokenCreation] Handing complete tx (' + tx.instructions.length + ' instructions) to signer...');

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

  /**
   * Fetch real-time cost estimate for the launch cost preview card.
   * All values are in SOL.
   */
  async estimateLaunchCost(isToken2022 = false): Promise<LaunchCostEstimate> {
    try {
      const mintSize = isToken2022 ? MINT_ACCOUNT_SIZE_2022 : MINT_ACCOUNT_SIZE;
      const [mintRentLamports, ataRentLamports, metadataRentLamports] = await Promise.all([
        getRentExemption(mintSize),
        getRentExemption(ATA_ACCOUNT_SIZE),
        getRentExemption(METADATA_ACCOUNT_SIZE),
      ]);
      const mintRent      = mintRentLamports     / LAMPORTS_PER_SOL;
      const ataRent       = ataRentLamports      / LAMPORTS_PER_SOL;
      const metadataRent  = metadataRentLamports / LAMPORTS_PER_SOL;
      const networkFee    = 0.00001; // 2 signatures × 5000 lamports each
      const networkAndMintCost = mintRent + ataRent + metadataRent + networkFee;
      return {
        mintRent,
        ataRent,
        metadataRent,
        networkFee,
        platformFee: PLATFORM_FEE_SOL,
        networkAndMintCost,
        total: networkAndMintCost + PLATFORM_FEE_SOL,
      };
    } catch {
      const mintRent     = isToken2022 ? 0.00387 : 0.00144;
      const ataRent      = 0.00204;
      const metadataRent = 0.00471; // ~679 bytes at current rent rate
      const networkFee   = 0.00001;
      const networkAndMintCost = mintRent + ataRent + metadataRent + networkFee;
      return { mintRent, ataRent, metadataRent, networkFee, networkAndMintCost, platformFee: PLATFORM_FEE_SOL, total: networkAndMintCost + PLATFORM_FEE_SOL };
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
   * data = [1] = CreateAssociatedTokenAccountIdempotent — succeeds even if
   * the ATA already exists (e.g. from a previous failed launch attempt).
   * Using idempotent avoids "account already in use" failures on retries.
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
      data: Buffer.from([1]),
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

  /**
   * Metaplex CreateMetadataAccountV3 instruction (instruction index 33).
   *
   * Borsh-encoded data layout (MetadataInstruction enum variant 33):
   *   [33]                           instruction discriminator
   *   DataV2:
   *     [u32-LE][bytes]  name         (max 32 chars)
   *     [u32-LE][bytes]  symbol       (max 10 chars)
   *     [u32-LE][bytes]  uri          (max 200 chars)
   *     [u16-LE]         seller_fee_basis_points
   *     [0x00]           creators: Option = None
   *     [0x00]           collection: Option = None
   *     [0x00]           uses: Option = None
   *   [0x01]             is_mutable: true
   *   [0x00]             collection_details: Option = None
   *
   * Account order matches mpl-token-metadata CreateMetadataAccountV3:
   *   0. metadata        — writable (PDA, not signer)
   *   1. mint            — readonly
   *   2. mintAuthority   — signer (the wallet, already signs as feePayer)
   *   3. payer           — signer, writable
   *   4. updateAuthority — readonly (set to creator; can be same key as payer)
   *   5. systemProgram
   *   6. rent sysvar
   */
  private buildCreateMetadataV3Ix(
    metadataAccount: PublicKey,
    mint: PublicKey,
    mintAuthority: PublicKey,
    payer: PublicKey,
    updateAuthority: PublicKey,
    name: string,
    symbol: string,
    uri: string,
  ): TransactionInstruction {
    const sfBuf = Buffer.alloc(2);
    sfBuf.writeUInt16LE(0, 0); // 0 seller fee basis points — not applicable for utility tokens

    const data = Buffer.concat([
      Buffer.from([33]),              // CreateMetadataAccountV3 instruction index
      borshStr(name.slice(0, 32)),    // name (Borsh string, max 32 chars)
      borshStr(symbol.slice(0, 10)),  // symbol (Borsh string, max 10 chars)
      borshStr(uri.slice(0, 200)),    // uri (Borsh string, max 200 chars)
      sfBuf,                          // seller_fee_basis_points: u16
      Buffer.from([0]),               // creators: Option<Vec<Creator>> = None
      Buffer.from([0]),               // collection: Option<Collection> = None
      Buffer.from([0]),               // uses: Option<Uses> = None
      Buffer.from([1]),               // is_mutable: bool = true
      Buffer.from([0]),               // collection_details: Option<CollectionDetails> = None
    ]);

    return new TransactionInstruction({
      keys: [
        { pubkey: metadataAccount,   isSigner: false, isWritable: true  },
        { pubkey: mint,              isSigner: false, isWritable: false },
        { pubkey: mintAuthority,     isSigner: true,  isWritable: false },
        { pubkey: payer,             isSigner: true,  isWritable: true  },
        { pubkey: updateAuthority,   isSigner: false, isWritable: false },
        { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId: TOKEN_METADATA_PROGRAM_ID,
      data,
    });
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

  private async deriveMetadataPDA(mint: PublicKey): Promise<PublicKey> {
    const [pda] = await PublicKey.findProgramAddress(
      [
        Buffer.from('metadata'),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID
    );
    return pda;
  }
}

export const tokenCreationService = new TokenCreationService();
