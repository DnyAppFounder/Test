import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SolanaConnectionService } from './solana/connectionService';
import { KeyDerivationManager } from '@/lib/crypto/keyDerivation';

// Public constants — safe to embed in client bundle
const DWORLD_MINT = (
  process.env.EXPO_PUBLIC_DWC_MINT ||
  'BW1T8pZB2S18nPyMP4sUySV5FoC3VboX6vg3nmvQpump'
).trim();

const TOKEN_PROGRAM_ID_STR       = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ASSOC_TOKEN_PROGRAM_ID_STR = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const SYSTEM_PROGRAM_ID_STR      = '11111111111111111111111111111111';

const DEVICE_FP_KEY = '@dawen_device_fp';

// ── SHA-256 / fallback hash ───────────────────────────────────────────────────

async function sha256hex(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(h, 33) ^ input.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ── Device fingerprint ────────────────────────────────────────────────────────

async function getOrCreateDeviceId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_FP_KEY);
    if (existing) return existing;
    const bytes = new Uint8Array(32);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    const id = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    await AsyncStorage.setItem(DEVICE_FP_KEY, id);
    return id;
  } catch {
    return 'unknown';
  }
}

export async function getDeviceFingerprintHash(): Promise<string> {
  const deviceId = await getOrCreateDeviceId();
  return sha256hex(`${Platform.OS}:${deviceId}`);
}

// ── ATA derivation ────────────────────────────────────────────────────────────

function deriveATA(owner: PublicKey, mint: PublicKey, tokenProgramId: PublicKey): PublicKey {
  const assocProgramId = new PublicKey(ASSOC_TOKEN_PROGRAM_ID_STR);
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgramId.toBuffer(), mint.toBuffer()],
    assocProgramId,
  );
  return ata;
}

// ── Detect DWORLD token program (SPL Token or Token-2022) ────────────────────

async function getDworldTokenProgram(): Promise<string> {
  const svc = SolanaConnectionService.getInstance();
  try {
    const mintInfo = await svc.rpcCall('getAccountInfo', [
      DWORLD_MINT,
      { encoding: 'jsonParsed', commitment: 'confirmed' },
    ]) as any;
    return mintInfo?.value?.owner ?? TOKEN_PROGRAM_ID_STR;
  } catch {
    return TOKEN_PROGRAM_ID_STR;
  }
}

// ── ATA check ─────────────────────────────────────────────────────────────────

export interface AtaStatus {
  exists: boolean;
  ataAddress: string;
  tokenProgram: string;
  mintAddress: string;
}

export async function checkDworldAta(walletAddress: string): Promise<AtaStatus> {
  const svc          = SolanaConnectionService.getInstance();
  const mint         = new PublicKey(DWORLD_MINT);
  const owner        = new PublicKey(walletAddress);
  const tokenProgram = await getDworldTokenProgram();
  const tokenProgramId = new PublicKey(tokenProgram);
  const ata          = deriveATA(owner, mint, tokenProgramId);
  const ataStr       = ata.toBase58();

  const ataInfo = await svc.rpcCall('getAccountInfo', [
    ataStr,
    { encoding: 'base64', commitment: 'confirmed' },
  ]) as any;

  return {
    exists: !!ataInfo?.value,
    ataAddress: ataStr,
    tokenProgram,
    mintAddress: DWORLD_MINT,
  };
}

// ── ATA creation (user is payer) ──────────────────────────────────────────────
// User pays ~0.002039 SOL rent for their DWORLD token account.
// Uses CreateIdempotent (discriminator=1) — no-op if ATA already exists.

export async function createDworldAta(mnemonic: string, accountIndex = 0): Promise<string> {
  const svc  = SolanaConnectionService.getInstance();
  const conn = svc.getConnection();
  const mint = new PublicKey(DWORLD_MINT);

  const rawKp  = KeyDerivationManager.deriveSolanaKeyPair(mnemonic, accountIndex);
  const keypair = Keypair.fromSecretKey(rawKp.secretKey);
  const owner   = keypair.publicKey;

  const tokenProgram      = await getDworldTokenProgram();
  const tokenProgramId    = new PublicKey(tokenProgram);
  const assocTokenProgram = new PublicKey(ASSOC_TOKEN_PROGRAM_ID_STR);
  const systemProgram     = new PublicKey(SYSTEM_PROGRAM_ID_STR);
  const ata               = deriveATA(owner, mint, tokenProgramId);

  // SOL balance check — ATA creation costs ~0.002039 SOL rent + fee
  const balResult = await svc.rpcCall('getBalance', [
    owner.toBase58(),
    { commitment: 'confirmed' },
  ]) as any;
  const solBalance = Number(balResult ?? 0) / LAMPORTS_PER_SOL;
  const MIN_SOL = 0.003;
  if (solBalance < MIN_SOL) {
    throw new Error(
      `INSUFFICIENT_SOL_FOR_ATA: need at least ${MIN_SOL} SOL (have ${solBalance.toFixed(6)} SOL)`,
    );
  }

  console.log(
    `[rewardSecurity] creating ATA | owner: ${owner.toBase58().slice(0,8)}` +
    ` | mint: ${DWORLD_MINT.slice(0,8)} | tokenProg: ${tokenProgram.slice(0,8)}` +
    ` | ata: ${ata.toBase58().slice(0,8)}`,
  );

  const tx = new Transaction();
  tx.add(new TransactionInstruction({
    programId: assocTokenProgram,
    keys: [
      { pubkey: owner,          isSigner: true,  isWritable: true  }, // payer
      { pubkey: ata,            isSigner: false, isWritable: true  }, // ATA
      { pubkey: owner,          isSigner: false, isWritable: false }, // owner
      { pubkey: mint,           isSigner: false, isWritable: false }, // mint
      { pubkey: systemProgram,  isSigner: false, isWritable: false }, // system
      { pubkey: tokenProgramId, isSigner: false, isWritable: false }, // token program
    ],
    data: Buffer.from([1]),
  }));

  const sig = await sendAndConfirmTransaction(conn, tx, [keypair], {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });

  console.log('[rewardSecurity] ATA created:', ata.toBase58(), '| sig:', sig);
  return sig;
}
