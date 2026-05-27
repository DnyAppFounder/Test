import {
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
  Keypair,
} from '@solana/web3.js';
import { SolanaConnectionService } from './solana/connectionService';
import { SecureWalletManager } from '@/lib/wallet/SecureWalletManager';
import { KeyDerivationManager } from '@/lib/crypto/keyDerivation';
import { ExternalWalletAdapter } from '@/lib/wallet/ExternalWalletAdapter';

export const TREASURY_WALLET = 'FvzoyNk8MSwMgWbiGRbhLASyJSusoVpVtaE2w11WFg2X';
export const DWORLD_MINT = 'BW1T8pZB2S18nPyMP4sUySV5FoC3VboX6vg3nmvQpump';
export const DTEST_MINT = DWORLD_MINT; // alias kept for backward compatibility

const TOKEN_PROGRAM_ID        = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID   = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const SYSTEM_PROGRAM_ID       = new PublicKey('11111111111111111111111111111111');

function tokenProgramForMint(_mintStr: string): PublicKey {
  // DWORLD_MINT (BW1T8pZB2S18nPyMP4sUySV5FoC3VboX6vg3nmvQpump) is a standard
  // Pump.fun SPL token minted under the original Token Program, NOT Token-2022.
  // Using TOKEN_2022_PROGRAM_ID for ATA derivation produces a wrong PDA and
  // causes AccountNotFound during simulation. Always use the standard Token Program.
  return TOKEN_PROGRAM_ID;
}

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

function deriveATA(ownerPubkey: PublicKey, mintPubkey: PublicKey, tokenProgram: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [ownerPubkey.toBuffer(), tokenProgram.toBuffer(), mintPubkey.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

async function ensureATA(
  rpc: SolanaConnectionService,
  payerPubkey: PublicKey,
  ownerPubkey: PublicKey,
  mintPubkey: PublicKey,
  tx: Transaction,
  tokenProgram: PublicKey
): Promise<PublicKey> {
  const ata = deriveATA(ownerPubkey, mintPubkey, tokenProgram);
  const info = await rpc.rpcCall('getAccountInfo', [ata.toBase58(), { commitment: 'confirmed' }]);
  if (!info?.value) {
    // CreateIdempotent discriminator = 1. Using empty data (alloc(0)) makes this
    // instruction unrecognizable to Phantom's simulator and triggers the unsafe warning.
    tx.add(new TransactionInstruction({
      programId: ASSOCIATED_TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: payerPubkey, isSigner: true, isWritable: true },
        { pubkey: ata, isSigner: false, isWritable: true },
        { pubkey: ownerPubkey, isSigner: false, isWritable: false },
        { pubkey: mintPubkey, isSigner: false, isWritable: false },
        { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: tokenProgram, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([1]),
    }));
  }
  return ata;
}

/** Poll for confirmation via JSON-RPC — no WebSocket dependency */
async function pollConfirmation(
  rpc: SolanaConnectionService,
  signature: string,
  timeoutMs = 60000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const result = await rpc.rpcCall('getSignatureStatuses', [
        [signature],
        { searchTransactionHistory: true },
      ]);
      const status = result?.value?.[0];
      if (status) {
        if (status.err) {
          throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`);
        }
        if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
          console.log('[Treasury] Confirmed:', signature, status.confirmationStatus);
          return;
        }
      }
    } catch (e: any) {
      if (e.message?.includes('Transaction failed')) throw e;
    }
  }
  throw new Error('Transaction not confirmed within 60 seconds');
}

async function sendRaw(rpc: SolanaConnectionService, tx: Transaction): Promise<string> {
  const rawTx = tx.serialize();
  const rawBase64 = Buffer.from(rawTx).toString('base64');
  const sig = await rpc.rpcCall('sendTransaction', [
    rawBase64,
    { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed' },
  ]);
  if (!sig || typeof sig !== 'string') {
    throw new Error(`RPC returned invalid signature: ${JSON.stringify(sig)}`);
  }
  return sig;
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
    const rpc = SolanaConnectionService.getInstance();
    const fromPubkey = new PublicKey(fromAddress);
    const treasuryPubkey = new PublicKey(TREASURY_WALLET);
    const tx = new Transaction();

    if (tokenMint && amountToken && amountToken > 0) {
      const mintPubkey = new PublicKey(tokenMint);
      const decimals = 6;
      const rawAmount = BigInt(Math.floor(amountToken * Math.pow(10, decimals)));
      const tokenProgram = tokenProgramForMint(tokenMint);

      const fromATA = await ensureATA(rpc, fromPubkey, fromPubkey, mintPubkey, tx, tokenProgram);
      const toATA = await ensureATA(rpc, fromPubkey, treasuryPubkey, mintPubkey, tx, tokenProgram);

      // Standard SPL Transfer (opcode 3) — works for all standard Token Program mints
      // including DWORLD (Pump.fun tokens use the original Token Program, not Token-2022)
      const transferData = Buffer.alloc(9);
      transferData.writeUInt8(3, 0);
      transferData.writeBigUInt64LE(rawAmount, 1);
      tx.add(new TransactionInstruction({
        programId: TOKEN_PROGRAM_ID,
        keys: [
          { pubkey: fromATA, isSigner: false, isWritable: true },
          { pubkey: toATA, isSigner: false, isWritable: true },
          { pubkey: fromPubkey, isSigner: true, isWritable: false },
        ],
        data: transferData,
      }));
    } else if (amountSol && amountSol > 0) {
      const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
      if (lamports < 1) throw new Error('SOL amount too small');
      tx.add(SystemProgram.transfer({ fromPubkey, toPubkey: treasuryPubkey, lamports }));
    } else {
      throw new Error('Invalid payment amount — specify amountSol or amountToken > 0');
    }

    const bhResult = await rpc.rpcCall('getLatestBlockhash', [{ commitment: 'confirmed' }]);
    const blockhash: string = bhResult?.value?.blockhash ?? bhResult?.blockhash;
    if (!blockhash) throw new Error('Could not fetch recent blockhash');
    tx.recentBlockhash = blockhash;
    tx.feePayer = fromPubkey;

    // Simulate before sending to Phantom — catches invalid instructions, missing accounts,
    // and insufficient balance before the wallet opens, preventing the unsafe-tx warning.
    const simResult = await rpc.rpcCall('simulateTransaction', [
      Buffer.from(tx.serialize({ verifySignatures: false })).toString('base64'),
      { encoding: 'base64', commitment: 'confirmed', sigVerify: false },
    ]);
    const simErr = simResult?.value?.err;
    if (simErr) {
      const logs: string[] = simResult?.value?.logs ?? [];
      const logStr = logs.slice(0, 4).join(' | ');
      if (typeof simErr === 'object' && 'InstructionError' in (simErr as any)) {
        const ie = (simErr as any).InstructionError;
        const idx = Array.isArray(ie) ? ie[0] : '?';
        const reason = Array.isArray(ie) ? JSON.stringify(ie[1]) : String(ie);
        if (reason.includes('InsufficientFunds') || reason.includes('0x1')) {
          throw new Error('Insufficient SOL for network fees');
        }
        if (reason.includes('Custom') || reason.includes('insufficient funds')) {
          throw new Error('Insufficient token balance');
        }
        throw new Error(`Transaction simulation failed at instruction ${idx}: ${reason}`);
      }
      throw new Error(`Transaction simulation failed: ${JSON.stringify(simErr)}${logStr ? ' — ' + logStr : ''}`);
    }

    onStatus?.('signing');
    let signature: string;

    if (connectedWalletId) {
      const provider = ExternalWalletAdapter.getProvider(connectedWalletId);
      if (!provider) throw new Error('Wallet provider not available. Open your wallet extension.');
      const signed = await provider.signTransaction(tx);
      onStatus?.('sending');
      signature = await sendRaw(rpc, signed as Transaction);
    } else {
      const walletManager = SecureWalletManager.getInstance();
      const mnemonic = await walletManager.getMnemonicUnlocked();
      const naclKeypair = KeyDerivationManager.deriveSolanaKeyPair(mnemonic, internalAccountIndex);
      const keypair = Keypair.fromSecretKey(naclKeypair.secretKey);
      tx.sign(keypair);
      onStatus?.('sending');
      signature = await sendRaw(rpc, tx);
    }

    console.log('[Treasury] Transaction sent:', signature);
    await pollConfirmation(rpc, signature);

    onStatus?.('confirmed');
    return { success: true, signature };
  } catch (err: any) {
    onStatus?.('failed');
    console.error('[Treasury] Payment error:', err);
    let msg: string = err?.message || 'Transaction failed';
    if (msg.includes('rejected') || msg.includes('User rejected')) {
      msg = 'Transaction rejected in wallet';
    } else if (msg.includes('insufficient') || msg.includes('balance') || msg.includes('0x1')) {
      msg = 'Insufficient balance';
    } else if (msg.includes('blockhash')) {
      msg = 'Blockhash expired — please try again';
    }
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
    const rpc = SolanaConnectionService.getInstance();
    const fromPubkey = new PublicKey(fromAddress);
    const mintPubkey = new PublicKey(tokenMint);
    const rawAmount = BigInt(Math.floor(amount * Math.pow(10, decimals)));

    const tokenProgram = tokenProgramForMint(tokenMint);
    const fromATA = deriveATA(fromPubkey, mintPubkey, tokenProgram);

    const data = Buffer.alloc(9);
    data.writeUInt8(8, 0); // burn instruction
    data.writeBigUInt64LE(rawAmount, 1);

    const tx = new Transaction().add(new TransactionInstruction({
      programId: tokenProgram,
      keys: [
        { pubkey: fromATA, isSigner: false, isWritable: true },
        { pubkey: mintPubkey, isSigner: false, isWritable: true },
        { pubkey: fromPubkey, isSigner: true, isWritable: false },
      ],
      data,
    }));

    const bhResult = await rpc.rpcCall('getLatestBlockhash', [{ commitment: 'confirmed' }]);
    const blockhash: string = bhResult?.value?.blockhash ?? bhResult?.blockhash;
    if (!blockhash) throw new Error('Could not fetch recent blockhash');
    tx.recentBlockhash = blockhash;
    tx.feePayer = fromPubkey;

    // Simulate before Phantom to prevent unsafe-tx warning
    const simResult = await rpc.rpcCall('simulateTransaction', [
      Buffer.from(tx.serialize({ verifySignatures: false })).toString('base64'),
      { encoding: 'base64', commitment: 'confirmed', sigVerify: false },
    ]);
    const simErr = simResult?.value?.err;
    if (simErr) {
      throw new Error(`Transaction simulation failed: ${JSON.stringify(simErr)}`);
    }

    onStatus?.('signing');
    let signature: string;

    if (connectedWalletId) {
      const provider = ExternalWalletAdapter.getProvider(connectedWalletId);
      if (!provider) throw new Error('Wallet provider not available.');
      const signed = await provider.signTransaction(tx);
      onStatus?.('sending');
      signature = await sendRaw(rpc, signed as Transaction);
    } else {
      const walletManager = SecureWalletManager.getInstance();
      const mnemonic = await walletManager.getMnemonicUnlocked();
      const naclKeypair = KeyDerivationManager.deriveSolanaKeyPair(mnemonic, internalAccountIndex);
      const keypair = Keypair.fromSecretKey(naclKeypair.secretKey);
      tx.sign(keypair);
      onStatus?.('sending');
      signature = await sendRaw(rpc, tx);
    }

    console.log('[Treasury] Burn sent:', signature);
    await pollConfirmation(rpc, signature);

    onStatus?.('confirmed');
    return { success: true, signature };
  } catch (err: any) {
    onStatus?.('failed');
    let msg = err?.message || 'Burn failed';
    if (msg.includes('rejected') || msg.includes('User rejected')) msg = 'Transaction rejected in wallet';
    return { success: false, error: msg };
  }
}
