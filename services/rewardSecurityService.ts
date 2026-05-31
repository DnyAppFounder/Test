import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SolanaConnectionService } from './solana/connectionService';
import { KeyDerivationManager } from '@/lib/crypto/keyDerivation';

const TOKEN_PROGRAM_ID_STR       = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM_ID_STR  = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const ASSOC_TOKEN_PROGRAM_ID_STR = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const SYSTEM_PROGRAM_ID_STR      = '11111111111111111111111111111111';

const DEVICE_FP_KEY = '@dawen_device_fp';

// ── Device fingerprint ────────────────────────────────────────────────────────
// Stable per-install identifier. Stored in AsyncStorage so it persists across
// sessions but is reset on reinstall. We hash it before sending to the server.

async function sha256hex(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(input),
    );
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback for environments without SubtleCrypto: use a djb2-style hash
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(h, 33) ^ input.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

async function getOrCreateDeviceId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_FP_KEY);
    if (existing) return existing;
    // Generate a random 32-byte id
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
  const platform = Platform.OS;
  const combined = `${platform}:${deviceId}`;
  return sha256hex(combined);
}

// ── ATA derivation (mirrors the edge function logic) ─────────────────────────

function deriveATA(
  owner: PublicKey,
  mint: PublicKey,
  tokenProgramId: PublicKey,
): PublicKey {
  const assocProgramId = new PublicKey(ASSOC_TOKEN_PROGRAM_ID_STR);
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgramId.toBuffer(), mint.toBuffer()],
    assocProgramId,
  );
  return ata;
}

// ── ATA existence check ───────────────────────────────────────────────────────

export interface AtaStatus {
  exists: boolean;
  ataAddress: string;
  tokenProgram: string;
}

export async function checkDworldAta(walletAddress: string): Promise<AtaStatus> {
  const mintStr = (process.env.EXPO_PUBLIC_DWC_MINT ?? '').trim();
  if (!mintStr) throw new Error('EXPO_PUBLIC_DWC_MINT is not configured');

  const mint      = new PublicKey(mintStr);
  const owner     = new PublicKey(walletAddress);
  const svc       = SolanaConnectionService.getInstance();

  // Detect token program from on-chain mint owner
  const mintInfo = await svc.rpcCall('getAccountInfo', [
    mintStr,
    { encoding: 'jsonParsed', commitment: 'confirmed' },
  ]) as any;

  const tokenProgram: string = mintInfo?.value?.owner ?? TOKEN_PROGRAM_ID_STR;
  const tokenProgramId = new PublicKey(tokenProgram);
  const ata = deriveATA(owner, mint, tokenProgramId);
  const ataStr = ata.toBase58();

  const ataInfo = await svc.rpcCall('getAccountInfo', [
    ataStr,
    { encoding: 'base64', commitment: 'confirmed' },
  ]) as any;

  return {
    exists: !!ataInfo?.value,
    ataAddress: ataStr,
    tokenProgram,
  };
}

// ── ATA creation (user is payer — treasury does NOT pay rent) ─────────────────
// Uses CreateIdempotent (discriminator = 1) so it's safe to call even if the
// ATA already exists — it simply becomes a no-op.

export async function createDworldAta(
  mnemonic: string,
  accountIndex = 0,
): Promise<string> {
  const mintStr = (process.env.EXPO_PUBLIC_DWC_MINT ?? '').trim();
  if (!mintStr) throw new Error('EXPO_PUBLIC_DWC_MINT is not configured');

  const mint    = new PublicKey(mintStr);
  const svc     = SolanaConnectionService.getInstance();
  const conn    = svc.getConnection();

  // Derive user keypair
  const rawKp  = KeyDerivationManager.deriveSolanaKeyPair(mnemonic, accountIndex);
  const keypair = Keypair.fromSecretKey(rawKp.secretKey);
  const owner   = keypair.publicKey;

  // Detect token program
  const mintInfo = await svc.rpcCall('getAccountInfo', [
    mintStr,
    { encoding: 'jsonParsed', commitment: 'confirmed' },
  ]) as any;

  const tokenProgram: string = mintInfo?.value?.owner ?? TOKEN_PROGRAM_ID_STR;
  const tokenProgramId    = new PublicKey(tokenProgram);
  const assocTokenProgram = new PublicKey(ASSOC_TOKEN_PROGRAM_ID_STR);
  const systemProgram     = new PublicKey(SYSTEM_PROGRAM_ID_STR);
  const ata               = deriveATA(owner, mint, tokenProgramId);

  // Check SOL balance — creating ATA requires ~0.00204 SOL rent
  const balResult = await svc.rpcCall('getBalance', [
    owner.toBase58(),
    { commitment: 'confirmed' },
  ]) as any;
  const solBalance = Number(balResult ?? 0) / LAMPORTS_PER_SOL;
  const MIN_SOL_FOR_ATA = 0.003; // 0.00204 rent + fee buffer
  if (solBalance < MIN_SOL_FOR_ATA) {
    throw new Error(
      `INSUFFICIENT_SOL_FOR_ATA: you need at least ${MIN_SOL_FOR_ATA} SOL to create your DWORLD token account. ` +
      `Current balance: ${solBalance.toFixed(6)} SOL.`,
    );
  }

  // CreateIdempotent = discriminator 1
  // keys: [payer, ata, owner, mint, systemProgram, tokenProgram]
  const tx = new Transaction();
  tx.add(new TransactionInstruction({
    programId: assocTokenProgram,
    keys: [
      { pubkey: owner,           isSigner: true,  isWritable: true  }, // payer
      { pubkey: ata,             isSigner: false, isWritable: true  }, // ATA
      { pubkey: owner,           isSigner: false, isWritable: false }, // owner
      { pubkey: mint,            isSigner: false, isWritable: false }, // mint
      { pubkey: systemProgram,   isSigner: false, isWritable: false }, // system
      { pubkey: tokenProgramId,  isSigner: false, isWritable: false }, // token program
    ],
    data: Buffer.from([1]),
  }));

  const sig = await sendAndConfirmTransaction(conn, tx, [keypair], {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });

  console.log('[rewardSecurity] ATA created:', ata.toBase58(), 'sig:', sig);
  return sig;
}
