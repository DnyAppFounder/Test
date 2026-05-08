/**
 * tokenCreationService
 *
 * Single-transaction flow — ALL 5 instructions in one atomic Transaction:
 *   1. SystemProgram.createAccount      — allocate + fund mint account (mintRent)
 *   2. InitializeMint                   — set decimals + mint/freeze authorities
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
} from '@solana/web3.js';
import { SolanaConnectionService } from './solana/connectionService';
import { launchpadService, CreateTokenInput } from './launchpadService';
import { tokenRegistryService } from './tokenRegistryService';

// ── Program IDs ───────────────────────────────────────────────────────────────
const TOKEN_PROGRAM_ID            = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID       = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bJo');
const SYSTEM_PROGRAM_ID           = new PublicKey('11111111111111111111111111111111');
const SYSVAR_RENT_PUBKEY          = new PublicKey('SysvarRent111111111111111111111111111111111');

// ── Platform fee ──────────────────────────────────────────────────────────────
const PLATFORM_FEE_WALLET   = new PublicKey('FvzoyNk8MSwMgWbiGRbhLASyJSusoVpVtaE2w11WFg2X');
const PLATFORM_FEE_SOL      = 0.02;
const PLATFORM_FEE_LAMPORTS = Math.round(PLATFORM_FEE_SOL * LAMPORTS_PER_SOL);

// Account sizes for rent calculation
const MINT_ACCOUNT_SIZE      = 82;   // SPL Token mint
const MINT_ACCOUNT_SIZE_2022 = 234;  // Token-2022 mint base (82 + extension header)
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
      const networkFee = 0.00001; // 2 signatures × 5000 lamports
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

      // Balance check
      let balanceSol = 0;
      try {
        const lamports = await getBalance(creatorPubkey.toBase58());
        balanceSol = lamports / LAMPORTS_PER_SOL;
        console.log('[TokenCreation] Wallet balance:', balanceSol.toFixed(6), 'SOL | Required:', feeBreakdown.totalRequiredSol.toFixed(6), 'SOL');
      } catch (balErr: any) {
        console.warn('[TokenCreation] Balance check (non-fatal):', balErr?.message);
      }

      if (balanceSol > 0 && balanceSol < feeBreakdown.totalRequiredSol) {
        await launchpadService.updateRecord(record.id, { status: 'failed' });
        return {
          success: false,
          error: `Insufficient SOL: need ≥${feeBreakdown.totalRequiredSol.toFixed(4)} SOL, wallet has ${balanceSol.toFixed(4)} SOL`,
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

      // ix 1 — Allocate + fund mint account
      tx.add(SystemProgram.createAccount({
        fromPubkey:       creatorPubkey,
        newAccountPubkey: mintPubkey,
        lamports:         mintRentLamports,
        space:            mintSize,
        programId:        tokenProgramId,
      }));

      // ix 2 — Initialize the mint (decimals + authorities)
      tx.add(this.buildInitializeMintIx(
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
      // This is a native SOL transfer — Phantom/Solflare/Backpack show this as
      // "SOL transfer" in the approval screen, not just "network fee".
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
        // SystemProgram.transfer account[1] is the destination (toPubkey)
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
          msg = `Insufficient SOL to cover transaction fees (need ~${feeBreakdown.totalRequiredSol.toFixed(4)} SOL)`;
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
      const networkFee = 0.00001;
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
      const networkFee = 0.00001;
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
        { pubkey: mint,               isSigner: false, isWritable: true  },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
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
