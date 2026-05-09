/**
 * tokenCreationService
 *
 * Easy Launch — 6 instructions in one atomic Transaction:
 *   1. SystemProgram.createAccount      — allocate + fund mint account (mintRent)
 *   2. InitializeMint2                  — set decimals + mint/freeze authorities
 *   3. CreateAssociatedTokenAccountIdempotent — creator ATA (ataRent via ATA CPI)
 *   4. MintTo                           — mint full supply to creator ATA
 *   5. CreateMetadataAccountV3          — Metaplex on-chain metadata with valid URI
 *   6. SystemProgram.transfer           — explicit platform fee SOL transfer (LAST)
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

// ── Program IDs (mainnet only) ────────────────────────────────────────────────
const TOKEN_PROGRAM_ID            = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID       = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const SYSTEM_PROGRAM_ID           = new PublicKey('11111111111111111111111111111111');
const METADATA_PROGRAM_ID         = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// ── Platform fee ──────────────────────────────────────────────────────────────
const PLATFORM_FEE_WALLET   = new PublicKey('FvzoyNk8MSwMgWbiGRbhLASyJSusoVpVtaE2w11WFg2X');
const PLATFORM_FEE_SOL      = 0.02;
const PLATFORM_FEE_LAMPORTS = Math.round(PLATFORM_FEE_SOL * LAMPORTS_PER_SOL);

// Account sizes for rent calculation
const MINT_ACCOUNT_SIZE      = 82;
const MINT_ACCOUNT_SIZE_2022 = 234;
const ATA_ACCOUNT_SIZE       = 165;
const METADATA_ACCOUNT_SIZE  = 679; // approximate size of Metaplex metadata account

// Derive the Metaplex metadata PDA for a given mint
function findMetadataPda(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM_ID
  );
  return pda;
}

// ── Diagnostic logger ─────────────────────────────────────────────────────────
function diag(tag: string, ...args: any[]) {
  console.log(`[LAUNCH_DIAG] ${tag}`, ...args);
}

function diagError(tag: string, err: any) {
  const name    = err?.name    ?? 'UnknownError';
  const message = err?.message ?? String(err);
  const logs    = err?.logs    ?? err?.simulationResponse?.logs ?? null;
  console.error(`[LAUNCH_DIAG] ${tag}`, {
    name,
    message,
    logs: logs ? logs.join('\n') : null,
    stack: err?.stack?.split('\n').slice(0, 5).join('\n') ?? null,
  });
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
  /** Set when the tx was broadcast but confirmation is still pending. Never treat as failure. */
  pendingSignature?: string;
}

export interface TokenCreationProgress {
  step: number;
  totalSteps: number;
  label: string;
}

export type ProgressCallback = (progress: TokenCreationProgress) => void;

export interface FeeBreakdown {
  networkFee: number;
  mintRent: number;
  metadataRent: number;
  ataRent: number;
  platformFee: number;
  launchFee: number;
  liquidityAmount: number;
  priorityFee: number;
  totalRequiredSol: number;
}

export type LaunchCostEstimate = FeeBreakdown;

// ── BigInt write (browser-safe) ───────────────────────────────────────────────
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
      name: input.name, symbol: input.symbol, description: input.description,
      decimals: 6, totalSupply: total,
      creatorAllocation: Math.floor(total * 0.1),
      liquidityAllocation: Math.floor(total * 0.9),
      website: input.website, telegram: input.telegram,
      twitter: input.twitter, discord: input.discord,
      tokenProgram: 'spl-token', creatorWallet,
    };
  } else {
    return {
      name: input.name, symbol: input.symbol, description: input.description,
      decimals: input.decimals, totalSupply: input.totalSupply,
      creatorAllocation: input.creatorAllocation,
      liquidityAllocation: input.liquidityAllocation,
      website: input.website, telegram: input.telegram,
      twitter: input.twitter, discord: input.discord,
      tokenProgram: input.useToken2022 ? 'token-2022' : 'spl-token', creatorWallet,
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
  return { blockhash: result.value.blockhash, lastValidBlockHeight: result.value.lastValidBlockHeight };
}

async function getBalance(pubkey: string): Promise<number> {
  const connSvc = SolanaConnectionService.getInstance();
  const result = await connSvc.rpcCall('getBalance', [pubkey, { commitment: 'confirmed' }]);
  return typeof result === 'object' ? result.value : result;
}

/**
 * Poll getSignatureStatuses after tx broadcast but before success is confirmed.
 * Used to recover from pollConfirmation timeouts in launchpadSigningService.
 * Returns 'confirmed', 'failed', or 'pending'.
 */
async function pollSignatureLocal(
  sig: string,
  maxAttempts = 20,
  intervalMs = 3000
): Promise<'confirmed' | 'failed' | 'pending'> {
  const connSvc = SolanaConnectionService.getInstance();
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise<void>(r => setTimeout(r, intervalMs));
    try {
      const result = await connSvc.rpcCall('getSignatureStatuses', [
        [sig],
        { searchTransactionHistory: true },
      ]);
      const status = result?.value?.[0];
      if (!status) continue;
      if (status.err) return 'failed';
      const conf = status.confirmationStatus;
      if (conf === 'confirmed' || conf === 'finalized') return 'confirmed';
    } catch {
      // network error — continue polling
    }
  }
  return 'pending';
}

// ── Service ───────────────────────────────────────────────────────────────────

class TokenCreationService {

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
      diag('LAUNCH_START', {
        creatorWallet,
        rpcUrl: connSvc.getRpcUrl().slice(0, 80),
        proxy: connSvc.isUsingProxy(),
        mode: input.mode,
        name: input.name,
        symbol: input.symbol,
      });

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
          diag('IMAGE_UPLOAD_RESULT', { imageUrl: imageUrl?.slice(0, 80) ?? null });
        } catch (imgErr: any) {
          diag('IMAGE_UPLOAD_FAILED_NON_FATAL', imgErr?.message);
        }
      } else {
        diag('IMAGE_UPLOAD_SKIPPED', 'no imageUri provided');
      }

      // ── Step 3: Create DB record (pending) ─────────────────────────────────
      progress(3, 'Creating launch record in database...');

      const { data: record, error: recordError } = await launchpadService.createRecord({
        ...normalized, imageUrl,
      });
      if (recordError || !record) {
        const msg = recordError ?? 'Database launch record failed';
        diag('DB_RECORD_FAILED', msg);
        return { success: false, error: `Database error: ${msg}` };
      }
      diag('DB_RECORD_CREATED', { id: record.id });

      // ── Step 4: Upload metadata ─────────────────────────────────────────────
      // For Easy mode: metadata URI must be valid before the transaction is built.
      // An empty URI produces an on-chain metadata account that indexers cannot resolve.
      progress(4, 'Uploading token metadata...');

      let metadataUri: string | undefined;
      diag('TOKEN_METADATA_UPLOAD_START', { name: normalized.name, symbol: normalized.symbol, recordId: record.id });
      try {
        const metadata: Record<string, unknown> = {
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
            website:  normalized.website  ?? '',
            telegram: normalized.telegram ?? '',
            twitter:  normalized.twitter  ?? '',
            discord:  normalized.discord  ?? '',
            creator:  creatorWallet,
          },
        };
        metadataUri = await launchpadService.uploadMetadata(metadata, record.id) ?? undefined;
        diag('TOKEN_METADATA_UPLOAD_RESULT', { metadataUri: metadataUri ?? null });
      } catch (metaErr: any) {
        diagError('TOKEN_METADATA_UPLOAD_ERROR', metaErr);
      }

      // Block Easy Launch if metadata URI could not be obtained — an empty on-chain URI
      // means no indexer can resolve the logo/description, making the token invisible.
      if (isEasyMode && !metadataUri) {
        await launchpadService.updateRecord(record.id, { status: 'failed' });
        return {
          success: false,
          error: 'Metadata upload failed. Please try again — the token cannot be launched without a valid metadata URI.',
          tokenId: record.id,
        };
      }

      // ── Step 5: RPC connectivity + rent + blockhash ─────────────────────────
      progress(5, 'Connecting to Solana network...');

      diag('RPC_HEALTH_CHECK_START');
      try {
        const blockHeight = await connSvc.rpcCall('getBlockHeight', []);
        diag('RPC_HEALTH_CHECK_OK', { blockHeight });
      } catch (healthErr: any) {
        diagError('RPC_HEALTH_CHECK_FAILED', healthErr);
        await launchpadService.updateRecord(record.id, { status: 'failed' });
        return {
          success: false,
          error: `Cannot reach Solana network: ${healthErr?.message || 'RPC unreachable'}`,
          tokenId: record.id,
        };
      }

      // Easy mode always uses standard SPL Token — never Token-2022
      const isEasyMode  = input.mode === 'easy';
      const mintSize    = (!isEasyMode && normalized.tokenProgram === 'token-2022')
        ? MINT_ACCOUNT_SIZE_2022 : MINT_ACCOUNT_SIZE;
      let mintRentLamports: number;
      let ataRentLamports: number;
      let metadataRentLamports = 0;
      let blockhash: string;

      try {
        const rentResults = await Promise.all([
          getRentExemption(mintSize),
          getRentExemption(ATA_ACCOUNT_SIZE),
          isEasyMode ? getRentExemption(METADATA_ACCOUNT_SIZE) : Promise.resolve(0),
        ]);
        mintRentLamports     = rentResults[0];
        ataRentLamports      = rentResults[1];
        metadataRentLamports = rentResults[2];
        const bhResult = await getLatestBlockhash();
        blockhash = bhResult.blockhash;
        diag('LATEST_BLOCKHASH_FETCHED', {
          blockhash,
          lastValidBlockHeight: bhResult.lastValidBlockHeight,
          mintRentLamports,
          ataRentLamports,
          metadataRentLamports,
        });
      } catch (rpcErr: any) {
        diagError('RENT_OR_BLOCKHASH_FETCH_FAILED', rpcErr);
        await launchpadService.updateRecord(record.id, { status: 'failed' });
        return {
          success: false,
          error: `RPC error: ${rpcErr?.message || 'failed to fetch network state'}`,
          tokenId: record.id,
        };
      }

      const networkFee = 0.000005;
      const feeBreakdown: FeeBreakdown = {
        networkFee,
        mintRent:        mintRentLamports     / LAMPORTS_PER_SOL,
        metadataRent:    metadataRentLamports / LAMPORTS_PER_SOL,
        ataRent:         ataRentLamports      / LAMPORTS_PER_SOL,
        platformFee:     PLATFORM_FEE_SOL,
        launchFee:       0, liquidityAmount: 0, priorityFee: 0,
        totalRequiredSol: 0,
      };
      feeBreakdown.totalRequiredSol =
        feeBreakdown.networkFee + feeBreakdown.mintRent +
        feeBreakdown.metadataRent + feeBreakdown.ataRent + feeBreakdown.platformFee;

      diag('FEE_BREAKDOWN', feeBreakdown);

      let balanceSol = 0;
      let balanceFetched = false;
      try {
        const lamports = await getBalance(creatorPubkey.toBase58());
        balanceSol = lamports / LAMPORTS_PER_SOL;
        balanceFetched = true;
        diag('BALANCE_CHECK', {
          balanceSol: balanceSol.toFixed(6),
          requiredSol: feeBreakdown.totalRequiredSol.toFixed(6),
          sufficient: balanceSol >= feeBreakdown.totalRequiredSol,
        });
      } catch (balErr: any) {
        diag('BALANCE_CHECK_FAILED_NON_FATAL', balErr?.message);
      }

      if (balanceFetched && balanceSol < feeBreakdown.totalRequiredSol) {
        diag('BALANCE_INSUFFICIENT', {
          have: balanceSol.toFixed(6),
          need: feeBreakdown.totalRequiredSol.toFixed(6),
        });
        await launchpadService.updateRecord(record.id, { status: 'failed' });
        return {
          success: false,
          error: `Insufficient SOL: need ${feeBreakdown.totalRequiredSol.toFixed(4)} SOL, wallet has ${balanceSol.toFixed(4)} SOL`,
          tokenId: record.id,
        };
      }

      // ── Step 6: Build single transaction ───────────────────────────────────
      progress(6, 'Building on-chain transaction...');

      diag('BUILD_TRANSACTION_START', {
        tokenProgram: normalized.tokenProgram,
        decimals: normalized.decimals,
        creatorAllocation: normalized.creatorAllocation,
        totalSupply: normalized.totalSupply,
      });

      const mintKeypair = Keypair.generate();
      const mintPubkey  = mintKeypair.publicKey;

      // Easy Launch: always standard SPL Token (never Token-2022)
      const tokenProgramId = (!isEasyMode && normalized.tokenProgram === 'token-2022')
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;
      const effectiveDecimals = isEasyMode ? 6 : normalized.decimals;

      diag('MINT_KEYPAIR_GENERATED', {
        mintPubkey: mintPubkey.toBase58(),
        tokenProgramId: tokenProgramId.toBase58(),
        mode: isEasyMode ? 'easy' : 'advanced',
        decimals: effectiveDecimals,
      });

      const ata = await this.deriveAta(creatorPubkey, mintPubkey, tokenProgramId);
      diag('ATA_DERIVED', { ata: ata.toBase58() });

      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: creatorPubkey });

      // ix 1: allocate + fund the mint account
      tx.add(SystemProgram.createAccount({
        fromPubkey: creatorPubkey, newAccountPubkey: mintPubkey,
        lamports: mintRentLamports, space: mintSize, programId: tokenProgramId,
      }));

      // ix 2: initialize mint (decimals, authorities)
      tx.add(this.buildInitializeMint2Ix(
        mintPubkey, effectiveDecimals, creatorPubkey, creatorPubkey, tokenProgramId
      ));

      // ix 3: create creator ATA
      tx.add(this.buildCreateAtaIx(creatorPubkey, ata, creatorPubkey, mintPubkey, tokenProgramId));

      // ix 4: mint supply to creator ATA
      if (normalized.creatorAllocation > 0) {
        const rawAmount = BigInt(
          Math.floor(normalized.creatorAllocation * Math.pow(10, effectiveDecimals))
        );
        tx.add(this.buildMintToIx(mintPubkey, ata, creatorPubkey, rawAmount, tokenProgramId));
      }

      // ix 5 (Easy only): Metaplex metadata — must come after mintTo so mint is initialized
      if (isEasyMode) {
        tx.add(this.buildCreateMetadataV3Ix(
          creatorPubkey, mintPubkey, creatorPubkey, creatorPubkey,
          normalized.name, normalized.symbol, metadataUri ?? ''
        ));
      }

      // ix 6: platform fee SOL transfer — always last
      tx.add(
        SystemProgram.transfer({
          fromPubkey: creatorPubkey,
          toPubkey:   PLATFORM_FEE_WALLET,
          lamports:   PLATFORM_FEE_LAMPORTS,
        })
      );

      // ── Log every instruction ───────────────────────────────────────────────
      const PROGRAM_NAMES: Record<string, string> = {
        [SYSTEM_PROGRAM_ID.toBase58()]:           'SystemProgram',
        [TOKEN_PROGRAM_ID.toBase58()]:            'TokenProgram(SPL)',
        [TOKEN_2022_PROGRAM_ID.toBase58()]:       'TokenProgram(2022)',
        [ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()]: 'ATAProgram',
        [SYSVAR_RENT_PUBKEY.toBase58()]:          'SysvarRent',
      };

      const ixList = tx.instructions.map((ix, i) => {
        const prog = ix.programId.toBase58();
        const label = PROGRAM_NAMES[prog] ?? prog;

        let detail = '';
        if (prog === SYSTEM_PROGRAM_ID.toBase58() && ix.keys.length >= 2) {
          const to = ix.keys[1].pubkey.toBase58();
          if (to === PLATFORM_FEE_WALLET.toBase58()) {
            detail = `transfer → PLATFORM_FEE_WALLET (${PLATFORM_FEE_LAMPORTS} lamports)`;
          } else if (to === mintPubkey.toBase58()) {
            detail = `createAccount → mint (${mintRentLamports} lamports, space=${mintSize})`;
          } else {
            detail = `transfer → ${to.slice(0, 8)}...`;
          }
        }

        return { index: i + 1, program: label, detail, accounts: ix.keys.length, dataLen: ix.data.length };
      });

      diag('INSTRUCTIONS_LIST', ixList);

      const platformFeeWalletStr = PLATFORM_FEE_WALLET.toBase58();
      const hasPlatformFeeTransfer = tx.instructions.some(ix =>
        ix.programId.toBase58() === SYSTEM_PROGRAM_ID.toBase58() &&
        ix.keys.length >= 2 &&
        ix.keys[1].pubkey.toBase58() === platformFeeWalletStr
      );

      diag('PAYMENT_TRANSFER_FOUND', {
        found: hasPlatformFeeTransfer,
        platformFeeWallet: platformFeeWalletStr,
        platformFeeLamports: PLATFORM_FEE_LAMPORTS,
      });

      if (!hasPlatformFeeTransfer) {
        await launchpadService.updateRecord(record.id, { status: 'failed' });
        throw new Error('Launch transaction missing payment instructions. Launch aborted.');
      }

      // Easy: createAccount + initMint + createATA + mintTo + createMetadata + platformFee = 6
      // Advanced (no mintTo or metadata): createAccount + initMint + createATA + platformFee = 4
      const minExpected = isEasyMode ? 5 : 4;
      if (tx.instructions.length < minExpected) {
        throw new Error(`Transaction incomplete: only ${tx.instructions.length} instructions (expected ≥ ${minExpected}) — aborting`);
      }

      // ── Step 7: Sign, send, confirm ──────────────────────────────────────────
      progress(7, 'Waiting for wallet signature — then sending and confirming...');

      const rentLamports        = mintRentLamports + ataRentLamports + metadataRentLamports;
      const platformFeeLamports = PLATFORM_FEE_LAMPORTS;
      const estimatedNetworkFee = 5000;
      const totalLamportsPaidByUser = rentLamports + platformFeeLamports + estimatedNetworkFee;

      diag('LAMPORT_BREAKDOWN', {
        feePayer:              creatorPubkey.toBase58(),
        mintRentLamports,
        ataRentLamports,
        metadataRentLamports,
        rentLamports,
        platformFeeLamports,
        estimatedNetworkFee,
        totalLamportsPaidByUser,
        finalTotalRequiredSol: (totalLamportsPaidByUser / LAMPORTS_PER_SOL).toFixed(9),
        mintSize,
        mode:                  isEasyMode ? 'easy' : 'advanced',
        instructionCount:      tx.instructions.length,
        programs: tx.instructions.map(ix => ix.programId.toBase58()),
      });

      diag('WALLET_SIGNATURE_REQUESTED', {
        instructionCount: tx.instructions.length,
        feePayer: creatorPubkey.toBase58(),
        extraSigners: 1,
        extraSignerKey: mintPubkey.toBase58(),
        totalDebits: (totalLamportsPaidByUser / LAMPORTS_PER_SOL).toFixed(6) + ' SOL',
      });

      let txSignature: string;
      try {
        txSignature = await signAndSendTransaction(tx, [mintKeypair]);
      } catch (err: any) {
        diagError('SIGN_OR_SEND_FAILED', err);

        const embeddedSig: string | null = err?.signature ?? err?.txId ?? null;
        const raw = err?.message || String(err);
        const isUserRejection =
          raw.includes('rejected') || raw.includes('cancelled') ||
          raw.includes('denied') || raw.includes('User rejected');

        // Transaction was broadcast but confirmation timed out — do NOT mark failed.
        // Continue polling; only mark failed if getSignatureStatuses reports an on-chain error.
        if (embeddedSig && !isUserRejection) {
          diag('SIGNATURE_FOUND_IN_ERROR', {
            signature: embeddedSig,
            solscan: `https://solscan.io/tx/${embeddedSig}`,
            note: 'Tx broadcast — continuing confirmation polling',
          });

          // Save what we know immediately so data is not lost on refresh
          progress(7, 'Transaction sent — confirming on Solana...');
          await launchpadService.updateRecord(record.id, {
            mint_address: mintPubkey.toBase58(),
            creation_tx: embeddedSig,
            metadata_uri: metadataUri,
            image_url: imageUrl,
            status: 'pending',
          });

          // Poll for up to 60 s (20 × 3 s)
          progress(7, 'Confirming on Solana mainnet...');
          const confirmResult = await pollSignatureLocal(embeddedSig);

          if (confirmResult === 'confirmed') {
            await launchpadService.updateRecord(record.id, { status: 'deployed' });
            await launchpadService.recordLaunchTransaction(record.id, creatorWallet, embeddedSig, PLATFORM_FEE_SOL);
            await tokenRegistryService.registerWalletMints([mintPubkey.toBase58()]).catch(() => {});
            diag('CONFIRMATION_RECOVERED', { sig: embeddedSig });
            return {
              success: true,
              mintAddress: mintPubkey.toBase58(),
              txSignature: embeddedSig,
              tokenId: record.id,
              metadataUri,
            };
          }

          if (confirmResult === 'failed') {
            await launchpadService.updateRecord(record.id, { status: 'failed' });
            return {
              success: false,
              error: `Transaction failed on-chain. Check Solscan: https://solscan.io/tx/${embeddedSig}`,
              tokenId: record.id,
            };
          }

          // Still pending after extra polling — surface signature so UI can show Solscan link
          return {
            success: false,
            pendingSignature: embeddedSig,
            mintAddress: mintPubkey.toBase58(),
            tokenId: record.id,
            error: 'Transaction sent and pending confirmation.',
          };
        }

        // Normal failure (user rejection, simulation error, etc.)
        await launchpadService.updateRecord(record.id, { status: 'failed' });

        let msg: string;
        if (raw.includes('blockhash') || raw.includes('BlockhashNotFound'))
          msg = 'Blockhash expired — please retry';
        else if (raw.includes('0x1') || raw.includes('insufficient lamports') || raw.includes('Insufficient'))
          msg = `Insufficient SOL: need ${feeBreakdown.totalRequiredSol.toFixed(4)} SOL`;
        else if (isUserRejection)
          msg = 'Transaction cancelled by wallet';
        else if (raw.includes('simulation'))
          msg = `Simulation failed: ${raw}`;
        else
          msg = `Transaction failed: ${raw}`;

        return { success: false, error: msg, tokenId: record.id };
      }

      diag('SIGN_AND_SEND_SUCCESS', {
        txSignature,
        solscan: `https://solscan.io/tx/${txSignature}`,
      });

      // ── Save to DB ──────────────────────────────────────────────────────────
      diag('DATABASE_SAVE_START', { recordId: record.id, mintAddress: mintPubkey.toBase58() });
      await launchpadService.updateRecord(record.id, {
        mint_address: mintPubkey.toBase58(),
        status: 'deployed',
        creation_tx: txSignature,
        metadata_uri: metadataUri,
        image_url: imageUrl,
      });
      diag('DATABASE_SAVE_SUCCESS', { recordId: record.id });

      await launchpadService.recordLaunchTransaction(record.id, creatorWallet, txSignature, PLATFORM_FEE_SOL);
      diag('LAUNCH_TRANSACTION_RECORDED');

      await tokenRegistryService.registerWalletMints([mintPubkey.toBase58()]).catch((e) => {
        diag('REGISTRY_REGISTER_FAILED_NON_FATAL', e?.message);
      });

      diag('LAUNCHPAD_REFRESH_SUCCESS', {
        mintAddress: mintPubkey.toBase58(),
        txSignature,
        metadataUri: metadataUri ?? null,
        imageUrl: imageUrl ?? null,
      });

      return {
        success: true,
        mintAddress: mintPubkey.toBase58(),
        txSignature,
        tokenId: record.id,
        metadataUri,
      };

    } catch (err: any) {
      diagError('UNEXPECTED_ERROR', err);
      return { success: false, error: err?.message || 'Unexpected error during token creation' };
    }
  }

  async estimateLaunchCost(isToken2022 = false, includeMetadata = false): Promise<FeeBreakdown> {
    try {
      const mintSize = isToken2022 ? MINT_ACCOUNT_SIZE_2022 : MINT_ACCOUNT_SIZE;
      const rentFetches = [
        getRentExemption(mintSize),
        getRentExemption(ATA_ACCOUNT_SIZE),
        includeMetadata ? getRentExemption(METADATA_ACCOUNT_SIZE) : Promise.resolve(0),
      ];
      const [mintRentLamports, ataRentLamports, metadataRentLamports] = await Promise.all(rentFetches);
      const networkFee    = 0.000005;
      const mintRent      = mintRentLamports     / LAMPORTS_PER_SOL;
      const ataRent       = ataRentLamports      / LAMPORTS_PER_SOL;
      const metadataRent  = metadataRentLamports / LAMPORTS_PER_SOL;
      return {
        networkFee, mintRent, metadataRent, ataRent,
        platformFee: PLATFORM_FEE_SOL, launchFee: 0, liquidityAmount: 0, priorityFee: 0,
        totalRequiredSol: networkFee + mintRent + ataRent + metadataRent + PLATFORM_FEE_SOL,
      };
    } catch {
      const mintRent = isToken2022 ? 0.00387 : 0.00144;
      const metadataRent = includeMetadata ? 0.00671 : 0;
      return {
        networkFee: 0.000005, mintRent, metadataRent, ataRent: 0.00204,
        platformFee: PLATFORM_FEE_SOL, launchFee: 0, liquidityAmount: 0, priorityFee: 0,
        totalRequiredSol: 0.000005 + mintRent + 0.00204 + metadataRent + PLATFORM_FEE_SOL,
      };
    }
  }

  // ── Instruction builders ────────────────────────────────────────────────────

  private buildInitializeMint2Ix(
    mint: PublicKey, decimals: number,
    mintAuthority: PublicKey, freezeAuthority: PublicKey | null,
    programId: PublicKey
  ): TransactionInstruction {
    // SPL Token InitializeMint2 (instruction 20) layout — 70 bytes total:
    //   offset 0  : u8   instruction index (20)
    //   offset 1  : u8   decimals
    //   offset 2  : [u8;32] mintAuthority
    //   offset 34 : u32 LE COption discriminant (0=None, 1=Some) — MUST be 4 bytes
    //   offset 38 : [u8;32] freezeAuthority (zero-filled when None)
    const data = Buffer.alloc(70);
    data.writeUInt8(20, 0);
    data.writeUInt8(decimals, 1);
    mintAuthority.toBuffer().copy(data, 2);
    if (freezeAuthority !== null) {
      data.writeUInt32LE(1, 34);           // Some — 4-byte u32
      freezeAuthority.toBuffer().copy(data, 38);
    } else {
      data.writeUInt32LE(0, 34);           // None — 4-byte u32; bytes 38-69 are already 0
    }
    return new TransactionInstruction({
      keys: [{ pubkey: mint, isSigner: false, isWritable: true }],
      programId,
      data,
    });
  }

  private buildCreateAtaIx(
    payer: PublicKey, ata: PublicKey, owner: PublicKey,
    mint: PublicKey, tokenProgramId: PublicKey
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
    mint: PublicKey, destination: PublicKey, mintAuthority: PublicKey,
    amount: bigint, programId: PublicKey
  ): TransactionInstruction {
    const data = Buffer.alloc(9);
    data.writeUInt8(7, 0);
    writeUInt64LE(data, amount, 1);
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
   * Metaplex Token Metadata — CreateMetadataAccountV3 (instruction 33).
   *
   * Borsh layout:
   *   u8(33) | DataV2{name(str) symbol(str) uri(str) sellerFee(u16) creators(opt) collection(opt) uses(opt)}
   *   | is_mutable(u8) | collection_details(opt)
   *
   * Accounts (no rent sysvar needed in V3):
   *   0: metadata PDA  — writable
   *   1: mint          — read-only
   *   2: mint_authority — signer
   *   3: payer          — writable signer
   *   4: update_authority — read-only
   *   5: system_program — read-only
   */
  private buildCreateMetadataV3Ix(
    payer: PublicKey,
    mint: PublicKey,
    mintAuthority: PublicKey,
    updateAuthority: PublicKey,
    name: string,
    symbol: string,
    uri: string
  ): TransactionInstruction {
    const metadataPda  = findMetadataPda(mint);
    const nameBytes    = Buffer.from(name.slice(0, 32), 'utf8');
    const symbolBytes  = Buffer.from(symbol.slice(0, 10), 'utf8');
    const uriBytes     = Buffer.from(uri.slice(0, 200), 'utf8');

    // Total data bytes:
    // 1 (ix) + 4+nameLen + 4+symbolLen + 4+uriLen + 2 (fee) + 3 (opts) + 1 (mutable) + 1 (details)
    const size = 1 + 4 + nameBytes.length + 4 + symbolBytes.length + 4 + uriBytes.length + 2 + 1 + 1 + 1 + 1 + 1;
    const data = Buffer.alloc(size);
    let o = 0;

    data.writeUInt8(33, o++);                              // CreateMetadataAccountV3

    data.writeUInt32LE(nameBytes.length, o);   o += 4;
    nameBytes.copy(data, o);                   o += nameBytes.length;

    data.writeUInt32LE(symbolBytes.length, o); o += 4;
    symbolBytes.copy(data, o);                 o += symbolBytes.length;

    data.writeUInt32LE(uriBytes.length, o);    o += 4;
    uriBytes.copy(data, o);                    o += uriBytes.length;

    data.writeUInt16LE(0, o);  o += 2;         // seller_fee_basis_points = 0
    data.writeUInt8(0, o++);                   // creators = None
    data.writeUInt8(0, o++);                   // collection = None
    data.writeUInt8(0, o++);                   // uses = None
    data.writeUInt8(1, o++);                   // is_mutable = true
    data.writeUInt8(0, o++);                   // collection_details = None

    return new TransactionInstruction({
      keys: [
        { pubkey: metadataPda,      isSigner: false, isWritable: true  },
        { pubkey: mint,             isSigner: false, isWritable: false },
        { pubkey: mintAuthority,    isSigner: true,  isWritable: false },
        { pubkey: payer,            isSigner: true,  isWritable: true  },
        { pubkey: updateAuthority,  isSigner: false, isWritable: false },
        { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: METADATA_PROGRAM_ID,
      data,
    });
  }

  private async deriveAta(
    owner: PublicKey, mint: PublicKey,
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
