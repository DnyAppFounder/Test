/**
 * launchpadSigningService
 *
 * Wallet-agnostic signing helpers for launchpad transactions
 * (token creation, presale buy, claim, refund, finalize).
 *
 * Follows the same safe signing pattern as treasuryService:
 *   - External wallets: ExternalWalletAdapter.signTransaction
 *   - Internal wallets: SecureWalletManager + KeyDerivationManager
 *   - Simulate before wallet signs (prevents Phantom "unsafe dApp" warning)
 *
 * The returned signAndSend function:
 *   - Expects the caller (presaleService / tokenCreationService) to have already
 *     set tx.feePayer and tx.recentBlockhash before calling it.
 *   - Has extraSigners (e.g. mintKeypair) partialSign FIRST.
 *   - Simulates with sigVerify:false.
 *   - Gets the wallet to sign.
 *   - Sends via RPC and returns the signature string.
 *   - Does NOT poll for confirmation — callers handle that themselves.
 */

import { Transaction, Keypair, PublicKey } from '@solana/web3.js';
import { SolanaConnectionService } from './solana/connectionService';
import { ExternalWalletAdapter } from '@/lib/wallet/ExternalWalletAdapter';
import { SecureWalletManager } from '@/lib/wallet/SecureWalletManager';
import { KeyDerivationManager } from '@/lib/crypto/keyDerivation';
import type { UnifiedWallet } from '@/contexts/WalletContext';

// ─── Signer abstraction ───────────────────────────────────────────────────────

export interface WalletSigner {
  publicKey: PublicKey;
  signTransaction(tx: Transaction): Promise<Transaction>;
}

async function buildExternalSigner(wallet: UnifiedWallet): Promise<WalletSigner> {
  const providerId = wallet.providerId;
  if (!providerId) throw new Error('Please connect your wallet first.');
  const provider = ExternalWalletAdapter.getProvider(providerId);
  if (!provider) throw new Error('Wallet provider not available. Open your wallet extension.');
  const pubkey = new PublicKey(wallet.address);
  return {
    publicKey: pubkey,
    signTransaction: async (tx: Transaction) => {
      const signed = await provider.signTransaction(tx);
      return signed as Transaction;
    },
  };
}

async function buildInternalSigner(wallet: UnifiedWallet): Promise<WalletSigner> {
  const walletManager = SecureWalletManager.getInstance();
  const mnemonic = await walletManager.getMnemonicUnlocked();
  const accountIndex = wallet.accountIndex ?? 0;
  const naclKeypair = KeyDerivationManager.deriveSolanaKeyPair(mnemonic, accountIndex);
  const keypair = Keypair.fromSecretKey(naclKeypair.secretKey);
  return {
    publicKey: keypair.publicKey,
    signTransaction: async (tx: Transaction) => {
      tx.sign(keypair);
      return tx;
    },
  };
}

// ─── Raw send ────────────────────────────────────────────────────────────────

async function sendRaw(rpc: SolanaConnectionService, tx: Transaction): Promise<string> {
  const rawBase64 = Buffer.from(tx.serialize()).toString('base64');
  const sig = await rpc.rpcCall('sendTransaction', [
    rawBase64,
    { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed' },
  ]);
  if (!sig || typeof sig !== 'string') {
    throw new Error(`RPC returned invalid signature: ${JSON.stringify(sig)}`);
  }
  return sig;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Obtain a WalletSigner from a UnifiedWallet.
 * Throws a human-readable error if the wallet is unavailable.
 */
export async function getSigner(wallet: UnifiedWallet | null): Promise<WalletSigner> {
  if (!wallet) throw new Error('Please connect your wallet first.');
  if (wallet.type === 'connected') {
    return buildExternalSigner(wallet);
  }
  return buildInternalSigner(wallet);
}

/**
 * Build a signAndSend callback from a WalletSigner.
 *
 * Contract:
 *   - Caller must set tx.feePayer and tx.recentBlockhash before calling.
 *   - extraSigners (e.g. mintKeypair) partialSign BEFORE the wallet signer.
 *   - Transaction is simulated with sigVerify:false before wallet signs.
 *   - Returns the broadcast signature string.
 *   - Caller is responsible for confirming the transaction.
 */
export function makeSignAndSend(
  signer: WalletSigner
): (tx: Transaction, extraSigners?: Keypair[]) => Promise<string> {
  return async (tx: Transaction, extraSigners?: Keypair[]) => {
    const rpc = SolanaConnectionService.getInstance();

    // Extra signers (e.g. mintKeypair) must sign before the wallet signer
    if (extraSigners && extraSigners.length > 0) {
      for (const kp of extraSigners) {
        tx.partialSign(kp);
      }
    }

    // Simulate before sending to wallet — prevents Phantom "unsafe dApp" warning
    try {
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
          const reason = Array.isArray(ie) ? JSON.stringify(ie[1]) : String(ie);
          if (reason.includes('InsufficientFunds') || reason.includes('0x1')) {
            throw new Error('Insufficient SOL for network fees');
          }
          if (reason.includes('Custom') || reason.includes('insufficient funds')) {
            throw new Error('Insufficient token balance');
          }
          const idx = Array.isArray(ie) ? ie[0] : '?';
          throw new Error(`Transaction simulation failed at instruction ${idx}: ${reason}`);
        }
        throw new Error(
          `Transaction simulation failed: ${JSON.stringify(simErr)}${logStr ? ' — ' + logStr : ''}`
        );
      }
    } catch (simCatch: any) {
      // Re-throw real simulation/balance failures; swallow transient network errors
      const m: string = simCatch?.message ?? '';
      if (
        m.includes('simulation failed') ||
        m.includes('Insufficient SOL') ||
        m.includes('Insufficient token')
      ) {
        throw simCatch;
      }
      console.warn('[LaunchpadSigning] simulation skipped (network error):', m);
    }

    // Wallet signs
    const signed = await signer.signTransaction(tx);

    // Broadcast and return signature — caller confirms
    return sendRaw(rpc, signed);
  };
}

// ─── Singleton-style export (matches import in gaming.tsx / [id].tsx) ─────────

export const launchpadSigningService = {
  getSigner,
  makeSignAndSend,
};
