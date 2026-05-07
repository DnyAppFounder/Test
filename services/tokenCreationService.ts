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

      console.log('[TokenCreation] Creator wallet:', creatorPubkey.toBase58());

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
        return { success: false, error: msg };
      }

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
        }
      } catch (metaErr: any) {
        console.warn('[TokenCreation] Metadata upload threw (non-fatal):', metaErr?.message);
      }

      // ── Step 5: Connect to Solana, check balance, build transaction ─────────
      progress(5, 'Connecting to Solana network...');

      let mintRentLamports: number;
      let ataRentLamports: number;
      let blockhash: string;

      try {
        [mintRentLamports, ataRentLamports] = await Promise.all([
          this.connection.getMinimumBalanceForRentExemption(MINT_ACCOUNT_SIZE),
          this.connection.getMinimumBalanceForRentExemption(ATA_ACCOUNT_SIZE),
        ]);
        const bhResult = await this.connection.getLatestBlockhash('confirmed');
        blockhash = bhResult.blockhash;
      } catch (rpcErr: any) {
        console.error('[TokenCreation] RPC connection failed:', rpcErr);
        await launchpadService.updateRecord(record.id, { status: 'failed' });
        return {
          success: false,
          error: `RPC timeout: cannot connect to Solana network — ${rpcErr?.message || 'unknown RPC error'}`,
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
      } catch {
        // non-fatal — proceed even if balance check fails
      }

      console.log(
        '[TokenCreation] Estimated cost:', requiredSol.toFixed(6), 'SOL |',
        'Wallet balance:', balanceSol.toFixed(6), 'SOL'
      );

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

      console.log('[TokenCreation] Mint publicKey:', mintPubkey.toBase58());

      // Derive ATA (can be derived from public key before account exists)
      const ata = await this.deriveAta(creatorPubkey, mintPubkey, tokenProgramId);

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
      }

      // 5. Metaplex metadata (if we have a URI)
      if (metadataUri) {
        const metaIx = this.buildMetaplexMetadataIx(
          mintPubkey, creatorPubkey, normalized.name, normalized.symbol, metadataUri
        );
        if (metaIx) tx.add(metaIx);
      }

      // 6. Platform fee transfer (FATAL — if this fails the tx is rejected entirely)
      tx.add(SystemProgram.transfer({
        fromPubkey: creatorPubkey,
        toPubkey: PLATFORM_FEE_WALLET,
        lamports: PLATFORM_FEE_LAMPORTS,
      }));

      console.log(
        '[TokenCreation] Transaction built:',
        tx.instructions.length, 'instructions |',
        'Platform fee:', PLATFORM_FEE_SOL, 'SOL →', PLATFORM_FEE_WALLET.toBase58().slice(0, 8)
      );

      // ── Simulate transaction ─────────────────────────────────────────────────
      try {
        // partialSign with mintKeypair so simulation can verify its signature
        tx.partialSign(mintKeypair);
        const simResult = await this.connection.simulateTransaction(tx, undefined, true);
        const simLogs = simResult.value.logs ?? [];
        console.log('[TokenCreation] Simulation logs:', simLogs.slice(0, 20));

        if (simResult.value.err) {
          const simErr = JSON.stringify(simResult.value.err);
          const logHint = simLogs.find(l =>
            l.includes('Error') || l.includes('failed') || l.includes('insufficient')
          ) ?? '';
          console.error('[TokenCreation] Simulation failed:', simErr, '\nLogs:', simLogs);
          await launchpadService.updateRecord(record.id, { status: 'failed' });
          return {
            success: false,
            error: `Transaction simulation failed: ${logHint || simErr}`,
            tokenId: record.id,
          };
        }
      } catch (simErr: any) {
        // Simulation threw (e.g. RPC doesn't support it) — proceed; signer re-signs fresh
        console.warn('[TokenCreation] Simulation threw (non-fatal):', simErr?.message);
      }

      // ── Step 7: Sign, send, confirm ──────────────────────────────────────────
      progress(7, 'Waiting for wallet signature...');

      let txSignature: string;
      try {
        // Pass mintKeypair as extra signer — the signing service will sign with both
        txSignature = await signAndSendTransaction(tx, [mintKeypair]);
      } catch (err: any) {
        console.error('[TokenCreation] Transaction rejected:', err);
        await launchpadService.updateRecord(record.id, { status: 'failed' });

        const raw = err?.message || String(err);
        let friendlyMsg = `Wallet rejected signature: ${raw}`;
        if (raw.includes('blockhash')) friendlyMsg = 'Blockhash expired — please retry';
        else if (raw.includes('0x1')) friendlyMsg = 'Insufficient SOL to cover transaction fees';
        else if (raw.includes('rejected') || raw.includes('cancelled') || raw.includes('denied'))
          friendlyMsg = 'Wallet rejected signature — transaction cancelled';
        else if (raw.includes('timeout') || raw.includes('timed out'))
          friendlyMsg = 'RPC timeout — Solana network is congested, please retry';

        return {
          success: false,
          error: friendlyMsg,
          tokenId: record.id,
        };
      }

      console.log('[TokenCreation] Transaction confirmed:', txSignature);

      // ── Save confirmed launch to DB ─────────────────────────────────────────
      await launchpadService.updateRecord(record.id, {
        mint_address: mintPubkey.toBase58(),
        status: 'deployed',
        creation_tx: txSignature,
        metadata_uri: metadataUri,
        image_url: imageUrl,
      });

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
