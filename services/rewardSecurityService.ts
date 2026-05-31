import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SolanaConnectionService } from './solana/connectionService';
import { KeyDerivationManager } from '@/lib/crypto/keyDerivation';

// Client-side mint constant — reads from public env, falls back to known address.
// DWC_MINT is the server secret name; EXPO_PUBLIC_DWC_MINT exposes it to the client bundle.
const DWC_MINT = (
  process.env.EXPO_PUBLIC_DWC_MINT ||
  'BW1T8pZB2S18nPyMP4sUySV5FoC3VboX6vg3nmvQpump'
).trim();

const TOKEN_PROGRAM_ID_STR       = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ASSOC_TOKEN_PROGRAM_ID_STR = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const SYSTEM_PROGRAM_ID_STR      = '11111111111111111111111111111111';

const DEVICE_FP_KEY = '@dawen_device_fp';

// ── SHA-256 helper ────────────────────────────────────────────────────────────

async function sha256hex(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // djb2 fallback for environments without Web Crypto
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
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgramId.toBuffer(), mint.toBuffer()],
    new PublicKey(ASSOC_TOKEN_PROGRAM_ID_STR),
  );
  return ata;
}

// ── Detect token program (SPL Token or Token-2022) ───────────────────────────

async function getDwcTokenProgram(): Promise<string> {
  const svc = SolanaConnectionService.getInstance();
  try {
    const mintInfo = await svc.rpcCall('getAccountInfo', [
      DWC_MINT,
      { encoding: 'jsonParsed', commitment: 'confirmed' },
    ]) as any;
    return mintInfo?.value?.owner ?? TOKEN_PROGRAM_ID_STR;
  } catch {
    return TOKEN_PROGRAM_ID_STR;
  }
}

// ── ATA existence check ───────────────────────────────────────────────────────

export interface AtaStatus {
  exists: boolean;
  ataAddress: string;
  tokenProgram: string;
  mintAddress: string;
}

export async function checkDwcAta(walletAddress: string): Promise<AtaStatus> {
  const svc          = SolanaConnectionService.getInstance();
  const mint         = new PublicKey(DWC_MINT);
  const owner        = new PublicKey(walletAddress);
  const tokenProgram = await getDwcTokenProgram();
  const ata          = deriveATA(owner, mint, new PublicKey(tokenProgram));
  const ataStr       = ata.toBase58();

  const ataInfo = await svc.rpcCall('getAccountInfo', [
    ataStr,
    { encoding: 'base64', commitment: 'confirmed' },
  ]) as any;

  return {
    exists: !!ataInfo?.value,
    ataAddress: ataStr,
    tokenProgram,
    mintAddress: DWC_MINT,
  };
}

// ── ATA creation — user is fee payer and rent payer ──────────────────────────
// Uses CreateIdempotent (discriminator=1): no-op if ATA already exists.
// Avoids sendAndConfirmTransaction which fails with the Supabase RPC proxy —
// instead uses svc.rpcCall() directly (same path the edge function uses).

export async function createDwcAta(mnemonic: string, accountIndex = 0): Promise<string> {
  const svc  = SolanaConnectionService.getInstance();
  const mint = new PublicKey(DWC_MINT);

  const rawKp   = KeyDerivationManager.deriveSolanaKeyPair(mnemonic, accountIndex);
  const keypair = Keypair.fromSecretKey(rawKp.secretKey);
  const owner   = keypair.publicKey;

  const tokenProgram      = await getDwcTokenProgram();
  const tokenProgramId    = new PublicKey(tokenProgram);
  const assocTokenProgram = new PublicKey(ASSOC_TOKEN_PROGRAM_ID_STR);
  const systemProgram     = new PublicKey(SYSTEM_PROGRAM_ID_STR);
  const ata               = deriveATA(owner, mint, tokenProgramId);

  // ATA creation costs ~0.002039 SOL rent-exempt deposit + ~0.000005 SOL fee
  const balResult = await svc.rpcCall('getBalance', [
    owner.toBase58(),
    { commitment: 'confirmed' },
  ]) as any;
  const solBalance = Number(balResult ?? 0) / LAMPORTS_PER_SOL;
  if (solBalance < 0.003) {
    throw new Error(
      `INSUFFICIENT_SOL_FOR_ATA: need at least 0.003 SOL (have ${solBalance.toFixed(6)} SOL)`,
    );
  }

  console.log(
    `[rewardSecurity] creating ATA | mint: ${DWC_MINT.slice(0, 8)}` +
    ` | owner: ${owner.toBase58().slice(0, 8)} | ata: ${ata.toBase58().slice(0, 8)}` +
    ` | tokenProg: ${tokenProgram.slice(0, 8)} | sol: ${solBalance.toFixed(4)}`,
  );

  // Build the CreateIdempotent instruction
  const tx = new Transaction();
  tx.add(new TransactionInstruction({
    programId: assocTokenProgram,
    keys: [
      { pubkey: owner,          isSigner: true,  isWritable: true  }, // payer
      { pubkey: ata,            isSigner: false, isWritable: true  }, // ATA
      { pubkey: owner,          isSigner: false, isWritable: false }, // owner
      { pubkey: mint,           isSigner: false, isWritable: false }, // mint
      { pubkey: systemProgram,  isSigner: false, isWritable: false }, // system program
      { pubkey: tokenProgramId, isSigner: false, isWritable: false }, // token program
    ],
    data: Buffer.from([1]), // CreateIdempotent discriminator
  }));

  // Get blockhash via rpcCall — works with the Supabase proxy unlike Connection internals
  let blockhash: string;
  try {
    const bhResult = await svc.rpcCall('getLatestBlockhash', [{ commitment: 'confirmed' }]) as any;
    blockhash = bhResult?.value?.blockhash ?? bhResult?.blockhash;
    if (!blockhash) throw new Error('empty blockhash response');
  } catch (e: any) {
    throw new Error(`Network error while preparing token account creation. Please try again. (${e?.message})`);
  }

  tx.recentBlockhash = blockhash;
  tx.feePayer = owner;
  tx.sign(keypair);

  // Serialize — btoa/fromCharCode avoids Buffer polyfill issues on web
  const serialized = tx.serialize();
  const base64Tx = btoa(String.fromCharCode(...serialized));

  // Simulate before sending
  const simResult = await svc.rpcCall('simulateTransaction', [
    base64Tx,
    { encoding: 'base64', commitment: 'confirmed' },
  ]) as any;
  if (simResult?.value?.err) {
    throw new Error(`Token account creation simulation failed: ${JSON.stringify(simResult.value.err)}`);
  }

  // Send
  const sig = await svc.rpcCall('sendTransaction', [
    base64Tx,
    { encoding: 'base64', skipPreflight: true },
  ]) as string;
  if (!sig || typeof sig !== 'string') {
    throw new Error('No signature returned from sendTransaction');
  }

  console.log(`[rewardSecurity] ATA tx sent: ${sig} | ata: ${ata.toBase58()}`);

  // Poll for confirmation
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2_500));
    const statResult = await svc.rpcCall('getSignatureStatuses', [
      [sig],
      { searchTransactionHistory: true },
    ]) as any;
    const status = statResult?.value?.[0];
    if (status?.err) {
      throw new Error(`Token account creation failed on-chain: ${JSON.stringify(status.err)}`);
    }
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      console.log(`[rewardSecurity] ATA confirmed: ${ata.toBase58()} | sig: ${sig}`);
      return sig;
    }
  }

  throw new Error('Token account creation not confirmed within 60s — check Solscan and retry');
}
