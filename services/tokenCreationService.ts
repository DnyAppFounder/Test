/**
 * tokenCreationService
 *
 * Single-transaction flow — ALL 5 instructions in one atomic Transaction:
 *   1. SystemProgram.createAccount      — allocate + fund mint account (mintRent)
 *   2. InitializeMint2                  — set decimals + mint/freeze authorities
 *                                         (instruction 20 — no rent sysvar required)
 *   3. CreateAssociatedTokenAccountIdempotent — creator ATA (ataRent via ATA CPI)
 *   4. MintTo                           — mint full supply to creator ATA
 *   5. SystemProgram.transfer           — explicit platform fee SOL transfer (LAST)
 *
 * A FeeBreakdown object is computed before building the transaction.
 * The same object drives both the UI preview and the actual instructions.
 * If the transaction contains no explicit SystemProgram.transfer to the
 * platform fee wallet, the launch is blocked with a clear error.
 *
 * Token metadata (name/symbol/uri/image) is stored in Supabase and the
 * token registry so every screen in the app can display it.
 */

import {
  PublicKey,
  Transaction,
  SystemProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import { SolanaConnectionService } from './solana/connectionService';
import { launchpadService, CreateTokenInput } from './launchpadService';
import { tokenRegistryService } from './tokenRegistryService';

// ── Program IDs ───────────────────────────────────────────────────────────────
const TOKEN_PROGRAM_ID            = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID       = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bJo');
const SYSTEM_PROGRAM_ID           = new PublicKey('11111111111111111111111111111111');

// ── Platform fee ──────────────────────────────────────────────────────────────
const PLATFORM_FEE_WALLET   = new PublicKey('FvzoyNk8MSwMgWbiGRbhLASyJSusoVpVtaE2w11WFg2X');
const PLATFORM_FEE_SOL      = 0.02;
const PLATFORM_FEE_LAMPORTS = Math.round(PLATFORM_FEE_SOL * LAMPORTS_PER_SOL);

// Account sizes for rent calculation
const MINT_ACCOUNT_SIZE      = 82;   // SPL Token mint
const MINT_ACCOUNT_SIZE_2022 = 234;  // Token-2022 mint base
const ATA_ACCOUNT_SIZE       = 165;  // Associated Token Account

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

/**
 * FeeBreakdown — all values in SOL.
 * Drives both the UI preview card and the actual transaction instructions.
 * Every non-zero fee MUST have a corresponding instruction in the transaction.
 */
export interface FeeBreakdown {
  networkFee: number;       // base tx fee (~2 signatures × 5000 lamports)
  mintRent: number;         // mint account rent exemption
  metadataRent: number;     // 0 — metadata stored off-chain in Supabase
  ataRent: number;          // creator ATA rent exemption (paid via ATA CPI)
  platformFee: number;      // DAWEN platform fee (SystemProgram.transfer)
  launchFee: number;        // 0 — reserved
  liquidityAmount: number;  // 0 — reserved
  priorityFee: number;      // 0 — reserved
  totalRequiredSol: number; // sum of all above
}

// Legacy alias so callers using LaunchCostEstimate still compile
export type LaunchCostEstimate = FeeBreakdown;

// ── BigInt write helper ───────────────────────────────────────────────────────
// Browser Buffer polyfills may not include writeBigUInt64LE.
// Manual 2×u32 write is equivalent and universally supported.
function writeUInt64LE(buf: Buffer, value: bigint, offset: number): void {
  const lo = Number(value & 0xFFFFFFFFn);
  const hi = Number((value >> 32n) & 0xFFFFFFFFn);
  buf.writeUInt32LE(lo, offset);
  buf.writeUInt32LE(hi, offset + 4);
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

// ── RPC helpers ───────────────────────────────────────────────────────────────

async function getRentExemption(dataSize: number): Promise<number> {
  const connSvc = SolanaConnectionService.getInstance();
  const result = await connSvc.rpcCall('getMinimumBalanceForRentExemption', [dataSize]);
  return typeof result === 'number' ? result : Number(result);
}

async function getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
  const connSvc = SolanaConnectionService.getInstance();
  const result = await connSvc.rpcCall('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  return {
    blockhash: result.value.blockhash,
    lastValidBlockHeight: result.value.lastValidBlockHeight,
  };
}

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
   * sendRawTransaction(), and polls confirmation via HTTP.
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

      const mintSize = normalized.tokenProgram === 'token-2022'
        ? MINT_ACCOUNT_SIZE_2022
        : MINT_ACCOUNT_SIZE;

      let mintRentLamports: number;
      let ataRentLamports: number;
      let blockhash: string;

      try {
        console.log('[TokenCreation] Fetching rent exemptions and blockhash...');
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

      // Build FeeBreakdown — same object used for balance check and transaction
      const networkFee = 0.000005; // 1 signature × 5000 lamports (mint keypair also signs)
      const feeBreakdown: FeeBreakdown = {
        networkFee,
        mintRent:        mintRentLamports / LAMPORTS_PER_SOL,
        metadataRent:    0,
        ataRent:         ataRentLamports  / LAMPORTS_PER_SOL,
        platformFee:     PLATFORM_FEE_SOL,
        launchFee:       0,
        liquidityAmount: 0,
        priorityFee:     0,
        totalRequiredSol: 0,
      };
      feeBreakdown.totalRequiredSol =
        feeBreakdown.networkFee +
        feeBreakdown.mintRent +
        feeBreakdown.ataRent +
        feeBreakdown.platformFee;

      console.log('[TokenCreation] FeeBreakdown:', JSON.stringify(feeBreakdown, null, 2));

      // Balance check — if fetch succeeds, enforce minimum balance strictly
      let balanceSol = 0;
      let balanceFetched = false;
      try {
        const lamports = await getBalance(creatorPubkey.toBase58());
        balanceSol = lamports / LAMPORTS_PER_SOL;
        balanceFetched = true;
        console.log('[TokenCreation] Wallet balance:', balanceSol.toFixed(6), 'SOL | Required:', feeBreakdown.totalRequiredSol.toFixed(6), 'SOL');
      } catch (balErr: any) {
        console.warn('[TokenCreation] Balance check failed (proceeding):', balErr?.message);
      }

      if (balanceFetched && balanceSol < feeBreakdown.totalRequiredSol) {
        await launchpadService.updateRecord(record.id, { status: 'failed' });
        return {
          success: false,
          error: `Insufficient SOL: need ${feeBreakdown.totalRequiredSol.toFixed(4)} SOL, wallet has ${balanceSol.toFixed(4)} SOL`,
          tokenId: record.id,
        };
      }

      // ── Step 6: Build single transaction ───────────────────────────────────
      progress(6, 'Building on-chain transaction...');

      const mintKeypair     = Keypair.generate();
      const mintPubkey      = mintKeypair.publicKey;
      const isToken2022     = normalized.tokenProgram === 'token-2022';
      const tokenProgramId  = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

      console.log('[TokenCreation] Generated mint keypair:', mintPubkey.toBase58());
      console.log('[TokenCreation] Token program:', normalized.tokenProgram);

      const ata = await this.deriveAta(creatorPubkey, mintPubkey, tokenProgramId);
      console.log('[TokenCreation] Creator ATA:', ata.toBase58());

      // ── Assemble the single atomic transaction ──────────────────────────────
      // ALL instructions that debit the payer MUST be inside this one Transaction.
      // The signing service rebuilds from tx.instructions with a fresh blockhash —
      // nothing is added or removed after this block.

      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: creatorPubkey });

      // ix 1 — Allocate + fund mint account with rent-exempt lamports
      tx.add(SystemProgram.createAccount({
        fromPubkey:       creatorPubkey,
        newAccountPubkey: mintPubkey,
        lamports:         mintRentLamports,
        space:            mintSize,
        programId:        tokenProgramId,
      }));

      // ix 2 — Initialize the mint using InitializeMint2 (instruction 20).
      //         Unlike InitializeMint (instruction 0), InitializeMint2 does NOT
      //         require the rent sysvar account, making the transaction simpler
      //         and more reliably simulated by all external wallets.
      tx.add(this.buildInitializeMint2Ix(
        mintPubkey, normalized.decimals, creatorPubkey, creatorPubkey, tokenProgramId
      ));

      // ix 3 — Create creator ATA (idempotent — safe to retry)
      tx.add(this.buildCreateAtaIx(creatorPubkey, ata, creatorPubkey, mintPubkey, tokenProgramId));

      // ix 4 — Mint full creator allocation into ATA
      if (normalized.creatorAllocation > 0) {
        const rawAmount = BigInt(
          Math.floor(normalized.creatorAllocation * Math.pow(10, normalized.decimals))
        );
        tx.add(this.buildMintToIx(mintPubkey, ata, creatorPubkey, rawAmount, tokenProgramId));
        console.log('[TokenCreation] MintTo amount:', rawAmount.toString(), 'raw units');
      }

      // ix 5 — Platform fee SOL transfer (LAST).
      // This is a native SOL transfer visible in ALL wallet approval screens.
      tx.add(
        SystemProgram.transfer({
          fromPubkey: creatorPubkey,
          toPubkey:   PLATFORM_FEE_WALLET,
          lamports:   PLATFORM_FEE_LAMPORTS,
        })
      );

      // ── Pre-sign guard: verify payment instruction is present ───────────────
      const platformFeeWalletStr = PLATFORM_FEE_WALLET.toBase58();
      const hasPlatformFeeTransfer = tx.instructions.some(ix => {
        if (ix.programId.toBase58() !== SYSTEM_PROGRAM_ID.toBase58()) return false;
        return ix.keys.length >= 2 &&
          ix.keys[1].pubkey.toBase58() === platformFeeWalletStr;
      });

      if (!hasPlatformFeeTransfer) {
        await launchpadService.updateRecord(record.id, { status: 'failed' });
        throw new Error('Launch transaction missing payment instructions. Launch aborted.');
      }

      const ixPrograms = tx.instructions.map(ix => ix.programId.toBase58());
      console.log('[TokenCreation] ── Final tx instructions (' + tx.instructions.length + ' total) ──');
      ixPrograms.forEach((prog, i) => {
        const label =
          prog === SYSTEM_PROGRAM_ID.toBase58()           ? 'SystemProgram' :
          prog === tokenProgramId.toBase58()              ? 'TokenProgram' :
          prog === ASSOCIATED_TOKEN_PROGRAM_ID.toBase58() ? 'ATAProgram' : prog.slice(0, 8);
        console.log(`  [${i + 1}] ${label}`);
      });
      console.log('[TokenCreation] Platform fee transfer included:', hasPlatformFeeTransfer);
      console.log('[TokenCreation] Total debit from creator:',
        (feeBreakdown.mintRent + feeBreakdown.ataRent + feeBreakdown.platformFee).toFixed(6),
        'SOL (excl. network fee)'
      );

      if (tx.instructions.length < 4) {
        throw new Error(`Transaction incomplete: only ${tx.instructions.length} instructions built — aborting`);
      }

      // ── Step 7: Sign, send, confirm ──────────────────────────────────────────
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
          msg = `Insufficient SOL: need ${feeBreakdown.totalRequiredSol.toFixed(4)} SOL`;
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
   * All values are in SOL. Returns a FeeBreakdown object.
   */
  async estimateLaunchCost(isToken2022 = false): Promise<FeeBreakdown> {
    try {
      const mintSize = isToken2022 ? MINT_ACCOUNT_SIZE_2022 : MINT_ACCOUNT_SIZE;
      const [mintRentLamports, ataRentLamports] = await Promise.all([
        getRentExemption(mintSize),
        getRentExemption(ATA_ACCOUNT_SIZE),
      ]);
      const networkFee = 0.000005;
      const mintRent   = mintRentLamports / LAMPORTS_PER_SOL;
      const ataRent    = ataRentLamports  / LAMPORTS_PER_SOL;
      const breakdown: FeeBreakdown = {
        networkFee,
        mintRent,
        metadataRent:    0,
        ataRent,
        platformFee:     PLATFORM_FEE_SOL,
        launchFee:       0,
        liquidityAmount: 0,
        priorityFee:     0,
        totalRequiredSol: networkFee + mintRent + ataRent + PLATFORM_FEE_SOL,
      };
      return breakdown;
    } catch {
      const mintRent   = isToken2022 ? 0.00387 : 0.00144;
      const ataRent    = 0.00204;
      const networkFee = 0.000005;
      return {
        networkFee,
        mintRent,
        metadataRent:    0,
        ataRent,
        platformFee:     PLATFORM_FEE_SOL,
        launchFee:       0,
        liquidityAmount: 0,
        priorityFee:     0,
        totalRequiredSol: networkFee + mintRent + ataRent + PLATFORM_FEE_SOL,
      };
    }
  }

  // ── Instruction builders ────────────────────────────────────────────────────

  /**
   * InitializeMint2 — SPL Token instruction 20.
   *
   * Identical to InitializeMint (0) but does NOT require the rent sysvar account.
   * This makes the transaction leaner and avoids sysvar-related simulation issues
   * in external wallets (Phantom, Solflare, Backpack).
   *
   * Data layout (always 67 bytes):
   *   [0]  20          instruction discriminator
   *   [1]  decimals    u8
   *   [2..33]          mintAuthority  Pubkey (32 bytes)
   *   [34] 0 or 1      freezeAuthority COption discriminant
   *   [35..66]         freezeAuthority Pubkey (32 bytes, zeros if None)
   *
   * Accounts:
   *   0. mint  [writable]  — the mint account (already allocated by createAccount)
   */
  private buildInitializeMint2Ix(
    mint: PublicKey,
    decimals: number,
    mintAuthority: PublicKey,
    freezeAuthority: PublicKey | null,
    programId: PublicKey
  ): TransactionInstruction {
    const data = Buffer.alloc(67);
    data.writeUInt8(20, 0);                                   // instruction index 20
    data.writeUInt8(decimals, 1);                             // decimals
    mintAuthority.toBuffer().copy(data, 2);                   // mint authority (bytes 2–33)
    if (freezeAuthority !== null) {
      data.writeUInt8(1, 34);                                 // COption: Some
      freezeAuthority.toBuffer().copy(data, 35);              // freeze authority (bytes 35–66)
    } else {
      data.writeUInt8(0, 34);                                 // COption: None (bytes 35–66 stay 0)
    }

    return new TransactionInstruction({
      keys: [
        { pubkey: mint, isSigner: false, isWritable: true },
      ],
      programId,
      data,
    });
  }

  /**
   * ATA program v1.1+ CreateAssociatedTokenAccountIdempotent instruction.
   * data = [1] = idempotent variant — succeeds even if ATA already exists.
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

  /**
   * MintTo — SPL Token instruction 7.
   * Mints `amount` raw token units to `destination`.
   * Uses manual u64 LE write to avoid browser Buffer polyfill limitations.
   */
  private buildMintToIx(
    mint: PublicKey,
    destination: PublicKey,
    mintAuthority: PublicKey,
    amount: bigint,
    programId: PublicKey
  ): TransactionInstruction {
    const data = Buffer.alloc(9);
    data.writeUInt8(7, 0);              // instruction 7 = MintTo
    writeUInt64LE(data, amount, 1);     // amount as u64 LE (bytes 1–8)
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
