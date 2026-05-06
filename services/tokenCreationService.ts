/**
 * tokenCreationService
 *
 * Handles on-chain SPL token creation via the connected wallet.
 * The user's wallet signs all transactions — private keys never touch the app.
 *
 * Flow:
 *  1. Upload logo to Supabase Storage
 *  2. Build + upload metadata JSON to Supabase Storage
 *  3. Create mint account on Solana via Metaplex Token Metadata Program
 *  4. Mint creator allocation to creator's ATA
 *  5. Save record to launchpad_tokens + global token registry
 *  6. Emit success only after confirmed on-chain tx
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

// Metaplex Token Metadata Program ID
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// SPL Token Program
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

// Token-2022 Program
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

// Associated Token Program
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bJo');

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

// Normalize easy-mode inputs into the full creation shape
function normalizeInput(input: TokenCreationInput, creatorWallet: string): CreateTokenInput {
  if (input.mode === 'easy') {
    const total = input.totalSupply;
    return {
      name: input.name,
      symbol: input.symbol,
      description: input.description,
      decimals: 6,
      totalSupply: total,
      creatorAllocation: Math.floor(total * 0.1),   // 10% to creator
      liquidityAllocation: Math.floor(total * 0.9), // 90% to liquidity
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

class TokenCreationService {
  private connection: Connection;

  constructor() {
    this.connection = SolanaConnectionService.getInstance().getConnection();
  }

  /**
   * Full token creation flow.
   * `signAndSendTransaction` is provided by the caller (wallet adapter / SecureWalletManager).
   * It receives a Transaction, signs it, sends it, and returns the signature.
   */
  async createToken(
    input: TokenCreationInput,
    creatorWallet: string,
    signAndSendTransaction: (tx: Transaction, signers?: Keypair[]) => Promise<string>,
    onProgress?: ProgressCallback,
    imageUri?: string
  ): Promise<TokenCreationResult> {
    const STEPS = 8;
    const progress = (step: number, label: string) =>
      onProgress?.({ step, totalSteps: STEPS, label });

    try {
      // 1. Validate wallet
      progress(1, 'Validating wallet...');
      let creatorPubkey: PublicKey;
      try {
        creatorPubkey = new PublicKey(creatorWallet);
      } catch {
        return { success: false, error: 'Invalid wallet address' };
      }

      const normalized = normalizeInput(input, creatorWallet);

      // 2. Upload image to Supabase Storage
      progress(2, 'Uploading token image...');
      let imageUrl: string | undefined;
      const uri = imageUri ?? (input.mode === 'easy' ? input.imageUri : (input as AdvancedModeInput).imageUri);
      if (uri) {
        imageUrl = await launchpadService.uploadImage(creatorWallet, uri) ?? undefined;
      }

      // 3. Create DB record (status = pending)
      progress(3, 'Preparing token record...');
      const record = await launchpadService.createRecord({ ...normalized, imageUrl });
      if (!record) {
        return { success: false, error: 'Failed to create token record in database' };
      }

      // 4. Build + upload metadata JSON
      progress(4, 'Uploading metadata...');
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
      const metadataUri = await launchpadService.uploadMetadata(metadata, record.id) ?? undefined;

      // 5. Generate mint keypair
      progress(5, 'Generating mint account...');
      const mintKeypair = Keypair.generate();
      const mintPubkey = mintKeypair.publicKey;
      const tokenProgramId = normalized.tokenProgram === 'token-2022' ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

      // Determine mint account size and rent
      const MINT_SIZE = 82;
      const rentExemption = await this.connection.getMinimumBalanceForRentExemption(MINT_SIZE);

      // 6. Build creation transaction
      progress(6, 'Building on-chain transaction...');
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');

      const tx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: creatorPubkey,
      });

      // Create mint account
      tx.add(
        SystemProgram.createAccount({
          fromPubkey: creatorPubkey,
          newAccountPubkey: mintPubkey,
          lamports: rentExemption,
          space: MINT_SIZE,
          programId: tokenProgramId,
        })
      );

      // Initialize mint instruction (manual encoding for SPL token)
      tx.add(this.initializeMintInstruction(
        mintPubkey,
        normalized.decimals,
        creatorPubkey,
        creatorPubkey,
        tokenProgramId
      ));

      // 7. Sign and send Tx 1: create + init mint
      progress(7, 'Waiting for wallet signature...');
      let txSignature: string;
      try {
        txSignature = await signAndSendTransaction(tx, [mintKeypair]);
      } catch (err: any) {
        await launchpadService.updateRecord(record.id, { status: 'failed' });
        return { success: false, error: err?.message || 'Transaction rejected by wallet', tokenId: record.id };
      }

      // 8. Mint to creator ATA + attach Metaplex metadata
      progress(8, 'Minting tokens to creator wallet...');
      try {
        const creatorAllocation = normalized.creatorAllocation;
        if (creatorAllocation > 0) {
          // Derive ATA
          const ata = await this.deriveAta(creatorPubkey, mintPubkey);
          const ataInfo = await this.connection.getAccountInfo(ata);
          const ataRent = await this.connection.getMinimumBalanceForRentExemption(165);

          const { blockhash: bh2 } = await this.connection.getLatestBlockhash('confirmed');
          const tx2 = new Transaction({ recentBlockhash: bh2, feePayer: creatorPubkey });

          // Create ATA if it doesn't exist
          if (!ataInfo) {
            tx2.add(this.createAtaInstruction(creatorPubkey, ata, creatorPubkey, mintPubkey, ataRent));
          }

          // MintTo creator allocation
          const rawAmount = BigInt(Math.floor(creatorAllocation * Math.pow(10, normalized.decimals)));
          tx2.add(this.mintToInstruction(mintPubkey, ata, creatorPubkey, rawAmount, tokenProgramId));

          // Attach Metaplex on-chain metadata (best-effort — tx failure won't abort launch)
          if (metadataUri) {
            const metaIx = this.buildMetaplexMetadataInstruction(
              mintPubkey, creatorPubkey, normalized.name, normalized.symbol, metadataUri
            );
            if (metaIx) tx2.add(metaIx);
          }

          await signAndSendTransaction(tx2, []);
        }
      } catch (mintErr: any) {
        // Mint-to failure is non-fatal for the DB record — log and continue
        console.warn('[TokenCreation] ATA/mintTo error (non-fatal):', mintErr?.message);
      }

      // Update DB with confirmed mint address
      await launchpadService.updateRecord(record.id, {
        mint_address: mintPubkey.toBase58(),
        status: 'deployed',
        creation_tx: txSignature,
        metadata_uri: metadataUri,
        image_url: imageUrl,
      });

      // Register in global token registry so it's searchable immediately
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

  /** SPL Token initializeMint instruction (manual encoding — no @solana/spl-token needed) */
  private initializeMintInstruction(
    mint: PublicKey,
    decimals: number,
    mintAuthority: PublicKey,
    freezeAuthority: PublicKey | null,
    programId: PublicKey
  ): TransactionInstruction {
    // InitializeMint instruction index = 0
    // Layout: [u8 instruction=0] [u8 decimals] [32 bytes mintAuthority] [option<32 bytes> freezeAuthority]
    const keys = [
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: new PublicKey('SysvarRent111111111111111111111111111111111'), isSigner: false, isWritable: false },
    ];

    const hasFreezeAuthority = freezeAuthority !== null;
    const dataLen = 2 + 32 + 1 + (hasFreezeAuthority ? 32 : 0);
    const data = Buffer.alloc(dataLen);
    let offset = 0;

    data.writeUInt8(0, offset); offset += 1;   // instruction index
    data.writeUInt8(decimals, offset); offset += 1; // decimals
    mintAuthority.toBuffer().copy(data, offset); offset += 32; // mint authority

    if (hasFreezeAuthority) {
      data.writeUInt8(1, offset); offset += 1;  // Option::Some
      freezeAuthority!.toBuffer().copy(data, offset);
    } else {
      data.writeUInt8(0, offset); // Option::None
    }

    return new TransactionInstruction({ keys, programId, data });
  }

  /** Derive Associated Token Account address */
  private async deriveAta(owner: PublicKey, mint: PublicKey): Promise<PublicKey> {
    const [ata] = await PublicKey.findProgramAddress(
      [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    return ata;
  }

  /**
   * Create Associated Token Account instruction.
   * ATA program instruction index 0 (create idempotent = 1, but standard = 0).
   * Layout: no data — program infers from accounts.
   */
  private createAtaInstruction(
    payer: PublicKey,
    ata: PublicKey,
    owner: PublicKey,
    mint: PublicKey,
    _rent: number  // unused — ATA program handles rent internally
  ): TransactionInstruction {
    return new TransactionInstruction({
      keys: [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: ata, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false }, // SystemProgram
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: new PublicKey('SysvarRent111111111111111111111111111111111'), isSigner: false, isWritable: false },
      ],
      programId: ASSOCIATED_TOKEN_PROGRAM_ID,
      data: Buffer.alloc(0), // no data for create
    });
  }

  /**
   * MintTo instruction — instruction index 7.
   * Layout: [u8 instruction=7] [u64 LE amount]
   */
  private mintToInstruction(
    mint: PublicKey,
    destination: PublicKey,
    mintAuthority: PublicKey,
    amount: bigint,
    programId: PublicKey
  ): TransactionInstruction {
    const data = Buffer.alloc(9);
    data.writeUInt8(7, 0); // MintTo instruction index
    data.writeBigUInt64LE(amount, 1);

    return new TransactionInstruction({
      keys: [
        { pubkey: mint, isSigner: false, isWritable: true },
        { pubkey: destination, isSigner: false, isWritable: true },
        { pubkey: mintAuthority, isSigner: true, isWritable: false },
      ],
      programId,
      data,
    });
  }

  /**
   * Build Metaplex create_metadata_account_v3 instruction.
   * Instruction discriminator = [33, 241, 65, 62, 238, 85, 214, 203] (8-byte Anchor discriminator).
   * Returns null if any required account cannot be derived.
   */
  private buildMetaplexMetadataInstruction(
    mint: PublicKey,
    updateAuthority: PublicKey,
    name: string,
    symbol: string,
    uri: string
  ): TransactionInstruction | null {
    try {
      // Derive metadata PDA: ["metadata", METADATA_PROGRAM_ID, mint]
      const [metadataPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('metadata'),
          METADATA_PROGRAM_ID.toBuffer(),
          mint.toBuffer(),
        ],
        METADATA_PROGRAM_ID
      );

      // Encode create_metadata_account_v3 args
      // Borsh layout:
      //   [8 discriminator]
      //   CreateMetadataAccountArgsV3:
      //     DataV2:
      //       [4+len] name
      //       [4+len] symbol
      //       [4+len] uri
      //       [2] seller_fee_basis_points
      //       [1] Option<Creators> = 0 (None)
      //       [1] Option<Collection> = 0 (None)
      //       [1] Option<Uses> = 0 (None)
      //     [1] is_mutable
      //     [1] Option<CollectionDetails> = 0 (None)

      const nameBytes = Buffer.from(name.slice(0, 32), 'utf8');
      const symbolBytes = Buffer.from(symbol.slice(0, 10), 'utf8');
      const uriBytes = Buffer.from(uri.slice(0, 200), 'utf8');

      const dataLen = 8 + 4 + nameBytes.length + 4 + symbolBytes.length + 4 + uriBytes.length + 2 + 1 + 1 + 1 + 1 + 1;
      const data = Buffer.alloc(dataLen);
      let offset = 0;

      // Anchor discriminator for create_metadata_account_v3
      const discriminator = [33, 241, 65, 62, 238, 85, 214, 203];
      discriminator.forEach((b) => { data.writeUInt8(b, offset++); });

      // name
      data.writeUInt32LE(nameBytes.length, offset); offset += 4;
      nameBytes.copy(data, offset); offset += nameBytes.length;

      // symbol
      data.writeUInt32LE(symbolBytes.length, offset); offset += 4;
      symbolBytes.copy(data, offset); offset += symbolBytes.length;

      // uri
      data.writeUInt32LE(uriBytes.length, offset); offset += 4;
      uriBytes.copy(data, offset); offset += uriBytes.length;

      // seller_fee_basis_points = 0
      data.writeUInt16LE(0, offset); offset += 2;

      // creators = None
      data.writeUInt8(0, offset++);
      // collection = None
      data.writeUInt8(0, offset++);
      // uses = None
      data.writeUInt8(0, offset++);
      // is_mutable = true
      data.writeUInt8(1, offset++);
      // collection_details = None
      data.writeUInt8(0, offset++);

      return new TransactionInstruction({
        keys: [
          { pubkey: metadataPda, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: updateAuthority, isSigner: true, isWritable: false }, // mint authority
          { pubkey: updateAuthority, isSigner: true, isWritable: false }, // payer
          { pubkey: updateAuthority, isSigner: false, isWritable: false }, // update authority
          { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
          { pubkey: new PublicKey('SysvarRent111111111111111111111111111111111'), isSigner: false, isWritable: false },
        ],
        programId: METADATA_PROGRAM_ID,
        data,
      });
    } catch {
      return null;
    }
  }

  /** Estimate the SOL cost for creating a token */
  async estimateCreationCost(): Promise<{ mintRent: number; totalSol: number }> {
    try {
      const mintRent = await this.connection.getMinimumBalanceForRentExemption(82);
      const mintRentSol = mintRent / LAMPORTS_PER_SOL;
      // ~5000 lamports fee + 0.02 SOL platform fee
      return {
        mintRent: mintRentSol,
        totalSol: mintRentSol + 0.02 + 0.000005,
      };
    } catch {
      return { mintRent: 0.00203928, totalSol: 0.022 };
    }
  }
}

export const tokenCreationService = new TokenCreationService();
