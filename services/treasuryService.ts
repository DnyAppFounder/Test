import {
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
} from '@solana/web3.js';
import { SolanaConnectionService } from './solana/connectionService';
import { SecureWalletManager } from '@/lib/wallet/SecureWalletManager';
import { KeyDerivationManager } from '@/lib/crypto/keyDerivation';
import { ExternalWalletAdapter } from '@/lib/wallet/ExternalWalletAdapter';

export const TREASURY_WALLET = 'FvzoyNk8MSwMgWbiGRbhLASyJSusoVpVtaE2w11WFg2X';
export const DTEST_MINT = '43m6D8gCagyJ4K6NjETr3wjSUUSAAwaFznKbCUECpump';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bv8');

export type PayStatus =
  | 'idle'
  | 'preparing'
  | 'signing'
  | 'sending'
  | 'confirmed'
  | 'failed';

export interface TreasuryPayParams {
  fromAddress: string;
  amountSol?: number;
  amountToken?: number;
  tokenMint?: string;
  connectedWalletId?: string | null;
  internalAccountIndex?: number;
  onStatus?: (s: PayStatus) => void;
}

export interface TreasuryPayResult {
  success: boolean;
  signature?: string;
  error?: string;
}

async function getOrCreateATA(
  connection: ReturnType<SolanaConnectionService['getConnection']>,
  fromPubkey: PublicKey,
  ownerPubkey: PublicKey,
  mintPubkey: PublicKey,
  tx: Transaction
): Promise<PublicKey> {
  const [ata] = PublicKey.findProgramAddressSync(
    [ownerPubkey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mintPubkey.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const info = await connection.getAccountInfo(ata);
  if (!info) {
    tx.add(new TransactionInstruction({
      programId: ASSOCIATED_TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: fromPubkey, isSigner: true, isWritable: true },
        { pubkey: ata, isSigner: false, isWritable: true },
        { pubkey: ownerPubkey, isSigner: false, isWritable: false },
        { pubkey: mintPubkey, isSigner: false, isWritable: false },
        { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.alloc(0),
    }));
  }
  return ata;
}

export async function payToTreasury(params: TreasuryPayParams): Promise<TreasuryPayResult> {
  const {
    fromAddress,
    amountSol,
    amountToken,
    tokenMint,
    connectedWalletId,
    internalAccountIndex = 0,
    onStatus,
  } = params;

  onStatus?.('preparing');

  try {
    const connection = SolanaConnectionService.getInstance().getConnection();
    const fromPubkey = new PublicKey(fromAddress);
    const treasuryPubkey = new PublicKey(TREASURY_WALLET);
    const tx = new Transaction();

    if (tokenMint && amountToken && amountToken > 0) {
      // SPL token transfer
      const mintPubkey = new PublicKey(tokenMint);
      const decimals = tokenMint === DTEST_MINT ? 6 : 6;
      const rawAmount = BigInt(Math.floor(amountToken * Math.pow(10, decimals)));

      const fromATA = await getOrCreateATA(connection, fromPubkey, fromPubkey, mintPubkey, tx);
      const toATA = await getOrCreateATA(connection, fromPubkey, treasuryPubkey, mintPubkey, tx);

      const data = Buffer.alloc(9);
      data.writeUInt8(3, 0);
      data.writeBigUInt64LE(rawAmount, 1);
      tx.add(new TransactionInstruction({
        programId: TOKEN_PROGRAM_ID,
        keys: [
          { pubkey: fromATA, isSigner: false, isWritable: true },
          { pubkey: toATA, isSigner: false, isWritable: true },
          { pubkey: fromPubkey, isSigner: true, isWritable: false },
        ],
        data,
      }));
    } else if (amountSol && amountSol > 0) {
      // Native SOL transfer
      const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
      tx.add(SystemProgram.transfer({ fromPubkey, toPubkey: treasuryPubkey, lamports }));
    } else {
      throw new Error('Invalid payment amount');
    }

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = fromPubkey;

    let signature: string;
    onStatus?.('signing');

    if (connectedWalletId) {
      const provider = ExternalWalletAdapter.getProvider(connectedWalletId);
      if (!provider) throw new Error('Wallet provider not available. Open your wallet extension.');
      const signed = await provider.signTransaction(tx);
      onStatus?.('sending');
      const rawTx = (signed as Transaction).serialize();
      signature = await connection.sendRawTransaction(rawTx, { skipPreflight: false });
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
    } else {
      const walletManager = SecureWalletManager.getInstance();
      const mnemonic = await walletManager.getMnemonicUnlocked();
      const keypair = KeyDerivationManager.deriveSolanaKeyPair(mnemonic, internalAccountIndex);
      tx.sign(keypair);
      onStatus?.('sending');
      const rawTx = tx.serialize();
      signature = await connection.sendRawTransaction(rawTx, { skipPreflight: false });
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
    }

    onStatus?.('confirmed');
    return { success: true, signature };
  } catch (err: any) {
    onStatus?.('failed');
    let msg = err?.message || 'Transaction failed';
    if (msg.includes('rejected') || msg.includes('User rejected')) msg = 'Transaction rejected in wallet';
    else if (msg.includes('insufficient') || msg.includes('balance')) msg = 'Insufficient balance';
    return { success: false, error: msg };
  }
}

export async function burnSplToken(params: {
  fromAddress: string;
  tokenMint: string;
  amount: number;
  decimals: number;
  connectedWalletId?: string | null;
  internalAccountIndex?: number;
  onStatus?: (s: PayStatus) => void;
}): Promise<TreasuryPayResult> {
  const { fromAddress, tokenMint, amount, decimals, connectedWalletId, internalAccountIndex = 0, onStatus } = params;
  onStatus?.('preparing');

  try {
    const connection = SolanaConnectionService.getInstance().getConnection();
    const fromPubkey = new PublicKey(fromAddress);
    const mintPubkey = new PublicKey(tokenMint);
    const rawAmount = BigInt(Math.floor(amount * Math.pow(10, decimals)));

    const [fromATA] = PublicKey.findProgramAddressSync(
      [fromPubkey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mintPubkey.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const BURN_IX = 8;
    const data = Buffer.alloc(9);
    data.writeUInt8(BURN_IX, 0);
    data.writeBigUInt64LE(rawAmount, 1);

    const burnIx = new TransactionInstruction({
      programId: TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: fromATA, isSigner: false, isWritable: true },
        { pubkey: mintPubkey, isSigner: false, isWritable: true },
        { pubkey: fromPubkey, isSigner: true, isWritable: false },
      ],
      data,
    });

    const tx = new Transaction().add(burnIx);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = fromPubkey;

    let signature: string;
    onStatus?.('signing');

    if (connectedWalletId) {
      const provider = ExternalWalletAdapter.getProvider(connectedWalletId);
      if (!provider) throw new Error('Wallet provider not available.');
      const signed = await provider.signTransaction(tx);
      onStatus?.('sending');
      const rawTx = (signed as Transaction).serialize();
      signature = await connection.sendRawTransaction(rawTx, { skipPreflight: false });
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
    } else {
      const walletManager = SecureWalletManager.getInstance();
      const mnemonic = await walletManager.getMnemonicUnlocked();
      const keypair = KeyDerivationManager.deriveSolanaKeyPair(mnemonic, internalAccountIndex);
      tx.sign(keypair);
      onStatus?.('sending');
      const rawTx = tx.serialize();
      signature = await connection.sendRawTransaction(rawTx, { skipPreflight: false });
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
    }

    onStatus?.('confirmed');
    return { success: true, signature };
  } catch (err: any) {
    onStatus?.('failed');
    let msg = err?.message || 'Burn failed';
    if (msg.includes('rejected') || msg.includes('User rejected')) msg = 'Transaction rejected in wallet';
    return { success: false, error: msg };
  }
}
