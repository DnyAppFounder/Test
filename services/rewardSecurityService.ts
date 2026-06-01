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
import { ExternalWalletAdapter, ExternalWalletId } from '@/lib/wallet/ExternalWalletAdapter';

// DWC_MINT: server secret name is DWC_MINT. Client reads EXPO_PUBLIC_DWC_MINT.
// Falls back to the hardcoded public mint address if env is not set.
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
  // djb2 fallback
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

// ── RPC helper: direct Helius first, Supabase proxy as fallback ───────────────
// For user-signed transactions (ATA creation), the direct RPC is more reliable
// than the Supabase proxy — faster, no proxy timeout, supports CORS for browsers.

async function ataRpcCall(method: string, params: any[]): Promise<any> {
  const svc = SolanaConnectionService.getInstance();

  // Build URL list: direct Helius URL first, proxy as fallback
  const directUrl = (process.env.EXPO_PUBLIC_SOLANA_RPC_URL || '').trim();
  const proxyUrl  = svc.getRpcUrl();
  const anonKey   = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();

  const urls: Array<{ url: string; needsAuth: boolean }> = [];
  if (directUrl) urls.push({ url: directUrl, needsAuth: false });
  if (proxyUrl && proxyUrl !== directUrl) urls.push({ url: proxyUrl, needsAuth: true });
  if (urls.length === 0) throw new Error('No Solana RPC URL configured');

  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: String(Date.now() + Math.random()),
    method,
    params,
  });

  let lastError = '';

  for (const { url, needsAuth } of urls) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (needsAuth && anonKey) {
      headers['Authorization'] = `Bearer ${anonKey}`;
      headers['apikey'] = anonKey;
    }

    console.log(`[ataRpc] ${method} -> ${url.slice(0, 60)}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(20_000),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        lastError = `HTTP ${response.status}: ${text.slice(0, 200)}`;
        console.error(`[ataRpc] ${method} non-OK from ${url.slice(0, 40)}: ${lastError}`);
        continue;
      }

      const json = await response.json();
      if (json.error) {
        lastError = `RPC error: ${json.error.message || JSON.stringify(json.error)}`;
        console.error(`[ataRpc] ${method} rpc error: ${lastError}`);
        continue;
      }

      return json.result;
    } catch (e: any) {
      lastError = e?.message || String(e);
      console.error(`[ataRpc] ${method} fetch failed (${url.slice(0, 40)}): ${lastError}`);
    }
  }

  throw new Error(`Network error: ${method} failed on all RPC endpoints. Last error: ${lastError}`);
}

// ── Detect token program (SPL Token or Token-2022) ───────────────────────────

async function getDwcTokenProgram(): Promise<string> {
  try {
    const mintInfo = await ataRpcCall('getAccountInfo', [
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
  const mint         = new PublicKey(DWC_MINT);
  const owner        = new PublicKey(walletAddress);
  const tokenProgram = await getDwcTokenProgram();
  const ata          = deriveATA(owner, mint, new PublicKey(tokenProgram));
  const ataStr       = ata.toBase58();

  const ataInfo = await ataRpcCall('getAccountInfo', [
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
// Uses CreateIdempotent (discriminator=1): safe to call if ATA already exists.
// Uses direct Helius RPC (not Supabase proxy) for reliability.
// User pays ~0.002039 SOL ATA rent + ~0.000005 SOL tx fee.
// Treasury NEVER pays ATA rent.

export async function createDwcAta(mnemonic: string, accountIndex = 0): Promise<string> {
  const mint = new PublicKey(DWC_MINT);

  console.log(`[rewardSecurity] createDwcAta | mint: ${DWC_MINT.slice(0, 8)}...${DWC_MINT.slice(-4)}`);

  const rawKp   = KeyDerivationManager.deriveSolanaKeyPair(mnemonic, accountIndex);
  const keypair = Keypair.fromSecretKey(rawKp.secretKey);
  const owner   = keypair.publicKey;

  const tokenProgram      = await getDwcTokenProgram();
  const tokenProgramId    = new PublicKey(tokenProgram);
  const assocTokenProgram = new PublicKey(ASSOC_TOKEN_PROGRAM_ID_STR);
  const systemProgram     = new PublicKey(SYSTEM_PROGRAM_ID_STR);
  const ata               = deriveATA(owner, mint, tokenProgramId);

  // Check balance — ATA creation needs ~0.003 SOL
  let solBalance = 0;
  try {
    const balResult = await ataRpcCall('getBalance', [
      owner.toBase58(),
      { commitment: 'confirmed' },
    ]) as any;
    solBalance = Number(balResult ?? 0) / LAMPORTS_PER_SOL;
  } catch (e: any) {
    throw new Error(`Network error checking wallet balance. Please try again. (${e?.message})`);
  }

  if (solBalance < 0.003) {
    throw new Error(
      `INSUFFICIENT_SOL_FOR_ATA: You need at least 0.003 SOL to create your DWORLD token account (have ${solBalance.toFixed(6)} SOL).`,
    );
  }

  console.log(
    `[rewardSecurity] owner: ${owner.toBase58().slice(0, 8)} | ata: ${ata.toBase58().slice(0, 8)}` +
    ` | tokenProg: ${tokenProgram.slice(0, 8)} | sol: ${solBalance.toFixed(4)}`,
  );

  // Build CreateIdempotent instruction (discriminator=1 = no-op if ATA already exists)
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
    data: Buffer.from([1]),
  }));

  // Fetch blockhash
  let blockhash: string;
  try {
    const bhResult = await ataRpcCall('getLatestBlockhash', [{ commitment: 'confirmed' }]) as any;
    blockhash = bhResult?.value?.blockhash ?? bhResult?.blockhash;
    if (!blockhash) throw new Error('empty blockhash in RPC response');
  } catch (e: any) {
    throw new Error(`Network error fetching blockhash. Please try again. (${e?.message})`);
  }

  tx.recentBlockhash = blockhash;
  tx.feePayer = owner;
  tx.sign(keypair);

  // Serialize — btoa/fromCharCode avoids Buffer polyfill issues on web
  const serialized = tx.serialize();
  const base64Tx   = btoa(String.fromCharCode(...serialized));

  // Simulate before sending (non-fatal — continue even if simulate endpoint fails)
  try {
    const simResult = await ataRpcCall('simulateTransaction', [
      base64Tx,
      { encoding: 'base64', commitment: 'confirmed' },
    ]) as any;
    if (simResult?.value?.err) {
      throw new Error(`Simulation failed: ${JSON.stringify(simResult.value.err)}`);
    }
  } catch (e: any) {
    if (e?.message?.startsWith('Simulation failed:')) throw e;
    // Network error on simulate — log and continue to send
    console.warn('[rewardSecurity] ATA simulate warn (non-fatal):', e?.message);
  }

  // Send transaction
  let sig: string;
  try {
    sig = await ataRpcCall('sendTransaction', [
      base64Tx,
      { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed' },
    ]) as string;
  } catch (e: any) {
    throw new Error(`Failed to send token account creation transaction. Please try again. (${e?.message})`);
  }

  if (!sig || typeof sig !== 'string') {
    throw new Error('No transaction signature returned. Please try again.');
  }

  console.log(`[rewardSecurity] ATA tx sent: ${sig.slice(0, 20)} | ata: ${ata.toBase58().slice(0, 8)}`);

  // Poll for confirmation (60s)
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2_500));
    try {
      const statResult = await ataRpcCall('getSignatureStatuses', [
        [sig],
        { searchTransactionHistory: true },
      ]) as any;
      const status = statResult?.value?.[0];
      if (status?.err) {
        throw new Error(`Token account creation failed on-chain: ${JSON.stringify(status.err)}`);
      }
      if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
        console.log(`[rewardSecurity] ATA confirmed | ata: ${ata.toBase58().slice(0, 8)}`);
        return sig;
      }
    } catch (e: any) {
      if (e?.message?.includes('failed on-chain')) throw e;
      // Poll network error — keep trying
    }
  }

  throw new Error('Token account creation not confirmed within 60s. Check Solscan and retry.');
}

// ── ATA creation for EXTERNAL wallets (Phantom/Backpack/Solflare) ─────────────
// Builds the same CreateIdempotent instruction but asks the external wallet
// provider to sign it via provider.signTransaction(). The user pays rent/fees.

export async function createDwcAtaForExternalWallet(
  walletAddress: string,
  providerId: ExternalWalletId,
): Promise<string> {
  const mint = new PublicKey(DWC_MINT);

  console.log(`[rewardSecurity] createDwcAtaForExternalWallet | provider: ${providerId} | wallet: ${walletAddress.slice(0, 8)}`);

  const owner = new PublicKey(walletAddress);
  const tokenProgram = await getDwcTokenProgram();
  const tokenProgramId = new PublicKey(tokenProgram);
  const assocTokenProgram = new PublicKey(ASSOC_TOKEN_PROGRAM_ID_STR);
  const systemProgram = new PublicKey(SYSTEM_PROGRAM_ID_STR);
  const ata = deriveATA(owner, mint, tokenProgramId);

  // Check SOL balance — ATA creation needs ~0.003 SOL
  let solBalance = 0;
  try {
    const balResult = await ataRpcCall('getBalance', [
      walletAddress,
      { commitment: 'confirmed' },
    ]) as any;
    solBalance = Number(balResult ?? 0) / LAMPORTS_PER_SOL;
  } catch (e: any) {
    throw new Error(`Network error checking wallet balance. Please try again. (${e?.message})`);
  }

  if (solBalance < 0.003) {
    throw new Error(
      `INSUFFICIENT_SOL_FOR_ATA: Your wallet needs at least 0.003 SOL to create the DWORLD token account (have ${solBalance.toFixed(6)} SOL).`,
    );
  }

  // Build CreateIdempotent instruction
  const tx = new Transaction();
  tx.add(new TransactionInstruction({
    programId: assocTokenProgram,
    keys: [
      { pubkey: owner,          isSigner: true,  isWritable: true  },
      { pubkey: ata,            isSigner: false, isWritable: true  },
      { pubkey: owner,          isSigner: false, isWritable: false },
      { pubkey: mint,           isSigner: false, isWritable: false },
      { pubkey: systemProgram,  isSigner: false, isWritable: false },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  }));

  let blockhash: string;
  try {
    const bhResult = await ataRpcCall('getLatestBlockhash', [{ commitment: 'confirmed' }]) as any;
    blockhash = bhResult?.value?.blockhash ?? bhResult?.blockhash;
    if (!blockhash) throw new Error('empty blockhash');
  } catch (e: any) {
    throw new Error(`Network error fetching blockhash. (${e?.message})`);
  }

  tx.recentBlockhash = blockhash;
  tx.feePayer = owner;

  // Ask external wallet to sign
  let signedTx: Transaction;
  try {
    signedTx = await ExternalWalletAdapter.signTransaction(providerId, tx);
  } catch (e: any) {
    throw new Error(`Wallet signing cancelled or failed. Please approve the transaction in your wallet. (${e?.message})`);
  }

  const serialized = signedTx.serialize();
  const base64Tx = btoa(String.fromCharCode(...serialized));

  let sig: string;
  try {
    sig = await ataRpcCall('sendTransaction', [
      base64Tx,
      { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed' },
    ]) as string;
  } catch (e: any) {
    throw new Error(`Failed to send token account creation transaction. (${e?.message})`);
  }

  if (!sig || typeof sig !== 'string') {
    throw new Error('No transaction signature returned. Please try again.');
  }

  console.log(`[rewardSecurity] external ATA tx sent: ${sig.slice(0, 20)} | ata: ${ata.toBase58().slice(0, 8)}`);

  // Poll for confirmation (60s)
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2_500));
    try {
      const statResult = await ataRpcCall('getSignatureStatuses', [
        [sig],
        { searchTransactionHistory: true },
      ]) as any;
      const status = statResult?.value?.[0];
      if (status?.err) throw new Error(`Token account creation failed: ${JSON.stringify(status.err)}`);
      if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
        console.log(`[rewardSecurity] external ATA confirmed | ata: ${ata.toBase58().slice(0, 8)}`);
        return sig;
      }
    } catch (e: any) {
      if (e?.message?.includes('failed:')) throw e;
    }
  }

  throw new Error('Token account creation not confirmed within 60s. Check Solscan and retry.');
}
