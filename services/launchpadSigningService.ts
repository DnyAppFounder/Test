/**
 * launchpadSigningService
 *
 * Central signing abstraction for the Launchpad.
 * Supports both internal wallets (SecureWalletManager mnemonic → Keypair)
 * and external wallets (Phantom/Backpack/Solflare via ExternalWalletAdapter).
 *
 * Uses HTTP-only confirmation polling (no websockets) so it works through
 * the Supabase Edge Function RPC proxy.
 *
 * Usage:
 *   const signer = await launchpadSigningService.getSigner(activeWallet);
 *   const sig = await signer.signAndSend(transaction, [extraSigners]);
 */

import {
  Transaction,
  Keypair,
  Connection,
  VersionedTransaction,
  PublicKey,
} from '@solana/web3.js';
import { SecureWalletManager } from '@/lib/wallet/SecureWalletManager';
import { ExternalWalletAdapter } from '@/lib/wallet/ExternalWalletAdapter';
import { KeyDerivationManager } from '@/lib/crypto/keyDerivation';
import { SolanaConnectionService } from './solana/connectionService';
import { UnifiedWallet } from '@/contexts/WalletContext';

export interface LaunchpadSigner {
  /** Sign and broadcast a transaction. Returns the tx signature. */
  signAndSend(tx: Transaction, extraSigners?: Keypair[]): Promise<string>;
  /** Public key as string */
  publicKey: string;
}

/**
 * Poll for transaction confirmation using getSignatureStatuses (HTTP, no websocket).
 * Retries every 2s for up to maxAttempts (default 30 = 60s).
 */
async function pollConfirmation(
  connection: Connection,
  signature: string,
  maxAttempts = 30
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const { value } = await connection.getSignatureStatuses([signature], {
        searchTransactionHistory: true,
      });
      const status = value?.[0];
      if (status) {
        if (status.err) {
          throw new Error(
            `Transaction failed on-chain: ${JSON.stringify(status.err)}`
          );
        }
        const conf = status.confirmationStatus;
        if (conf === 'confirmed' || conf === 'finalized') {
          return; // success
        }
      }
    } catch (e: any) {
      // Re-throw on-chain failures immediately
      if (e?.message?.startsWith('Transaction failed on-chain:')) throw e;
      // Network errors: keep polling
      console.warn(`[LaunchpadSigner] pollConfirmation attempt ${attempt + 1} network error:`, e?.message);
    }
  }
  throw new Error('Transaction confirmation timed out after 60s. It may still confirm — check Solscan.');
}

class LaunchpadSigningService {
  private connection: Connection;

  constructor() {
    this.connection = SolanaConnectionService.getInstance().getConnection();
  }

  /**
   * Returns a signer appropriate for the wallet type.
   * Throws if wallet is locked and cannot be unlocked.
   */
  async getSigner(wallet: UnifiedWallet): Promise<LaunchpadSigner> {
    if (wallet.type === 'connected' && wallet.providerId) {
      return this.externalSigner(wallet);
    }
    return this.internalSigner(wallet);
  }

  // ── Internal wallet signer ─────────────────────────────────────────────────

  private async internalSigner(wallet: UnifiedWallet): Promise<LaunchpadSigner> {
    const manager = SecureWalletManager.getInstance();
    const mnemonic = await manager.getMnemonicUnlocked();
    const accountIndex = wallet.accountIndex ?? 0;

    const derived = KeyDerivationManager.deriveSolanaKeyPair(mnemonic, accountIndex);
    const keypair = Keypair.fromSecretKey(derived.secretKey);

    const connection = this.connection;

    const connSvc = SolanaConnectionService.getInstance();

    return {
      publicKey: keypair.publicKey.toBase58(),
      signAndSend: async (tx: Transaction, extraSigners: Keypair[] = []) => {
        // Fetch a fresh blockhash via direct HTTP (no Connection WebSocket path)
        const bhResult = await connSvc.rpcCall('getLatestBlockhash', [{ commitment: 'confirmed' }]);
        const blockhash = bhResult.value.blockhash;
        tx.recentBlockhash = blockhash;
        tx.feePayer = keypair.publicKey;

        // Sign with mint keypair first (if present), then fee-payer
        const allSigners = [keypair, ...extraSigners];
        tx.sign(...allSigners);

        const rawTx = tx.serialize();

        console.log(
          '[LaunchpadSigner] Sending internal tx, feePayer:',
          keypair.publicKey.toBase58().slice(0, 8),
          'extraSigners:', extraSigners.length
        );

        // Send via direct rpcCall — no Connection object involved
        const encodedTx = Buffer.from(rawTx).toString('base64');
        const sig = await connSvc.rpcCall('sendTransaction', [
          encodedTx,
          { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 3 },
        ]);

        console.log('[LaunchpadSigner] Tx sent, sig:', String(sig).slice(0, 16), '— polling confirmation...');
        await pollConfirmation(connection, sig);
        console.log('[LaunchpadSigner] Tx confirmed:', String(sig).slice(0, 16));
        return sig;
      },
    };
  }

  // ── External wallet signer ─────────────────────────────────────────────────

  private externalSigner(wallet: UnifiedWallet): LaunchpadSigner {
    const providerId = wallet.providerId!;
    const connection = this.connection;
    const connSvc = SolanaConnectionService.getInstance();
    const MAX_ATTEMPTS = 3;

    return {
      publicKey: wallet.publicKey,
      signAndSend: async (tx: Transaction, extraSigners: Keypair[] = []) => {
        const feePayer = new PublicKey(wallet.publicKey);
        let lastError: any;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            // 1. Fetch a fresh blockhash as late as possible — immediately before signing
            const bhResult = await connSvc.rpcCall('getLatestBlockhash', [{ commitment: 'confirmed' }]);
            const blockhash: string = bhResult.value.blockhash;
            const lastValidBlockHeight: number = bhResult.value.lastValidBlockHeight;

            // 2. Build a fresh Transaction with the new blockhash.
            //    We never mutate the original tx's signatures, so each attempt is clean.
            const freshTx = new Transaction({ recentBlockhash: blockhash, feePayer });
            for (const ix of tx.instructions) {
              freshTx.add(ix);
            }

            // 3. partialSign with mint keypair before external wallet signs
            if (extraSigners.length > 0) {
              freshTx.partialSign(...extraSigners);
            }

            console.log(
              `[LaunchpadSigner] External wallet sign request (attempt ${attempt}/${MAX_ATTEMPTS}),`,
              'blockhash:', blockhash.slice(0, 8) + '...',
              'lastValidBlockHeight:', lastValidBlockHeight,
              'provider:', providerId,
              'extraSigners:', extraSigners.length
            );

            // 4. External wallet (Phantom) signs — user delay happens here
            const signed = await ExternalWalletAdapter.signTransaction(providerId, freshTx);

            // 5. Check if the blockhash is still within its valid window after user approved
            let currentHeight = 0;
            try {
              currentHeight = await connSvc.rpcCall('getBlockHeight', []);
            } catch {
              // Non-fatal — if we can't check, proceed optimistically
            }

            if (currentHeight > 0 && currentHeight > lastValidBlockHeight) {
              if (attempt < MAX_ATTEMPTS) {
                console.warn(
                  `[LaunchpadSigner] Blockhash expired (block ${currentHeight} > lastValid ${lastValidBlockHeight}),`,
                  `rebuilding tx for attempt ${attempt + 1}...`
                );
                continue;
              }
              throw new Error(
                'Transaction window expired — Solana blockhash expired while waiting for wallet approval. Please retry the launch.'
              );
            }

            // 6. Submit immediately with skipPreflight to bypass simulation-layer blockhash checks.
            //    The cluster will validate the blockhash itself during actual processing.
            const rawTx = (signed as Transaction).serialize();
            const encodedTx = Buffer.from(rawTx).toString('base64');

            console.log('[LaunchpadSigner] Submitting external tx (skipPreflight=true)...');
            const sig = await connSvc.rpcCall('sendTransaction', [
              encodedTx,
              { encoding: 'base64', skipPreflight: true, preflightCommitment: 'confirmed', maxRetries: 5 },
            ]);

            console.log('[LaunchpadSigner] External tx sent, sig:', String(sig).slice(0, 16), '— polling confirmation...');
            await pollConfirmation(connection, sig);
            console.log('[LaunchpadSigner] External tx confirmed:', String(sig).slice(0, 16));
            return sig;

          } catch (err: any) {
            lastError = err;
            const msg = err?.message || String(err);

            // Never retry on user rejection
            if (
              msg.includes('rejected') || msg.includes('cancelled') ||
              msg.includes('denied') || msg.includes('User rejected')
            ) {
              throw err;
            }

            // Auto-retry on blockhash expiry reported by the cluster
            if ((msg.includes('blockhash') || msg.includes('BlockhashNotFound')) && attempt < MAX_ATTEMPTS) {
              console.warn(
                `[LaunchpadSigner] Cluster rejected: blockhash not found (attempt ${attempt}), rebuilding for attempt ${attempt + 1}...`
              );
              continue;
            }

            throw err;
          }
        }

        throw lastError ?? new Error('Failed to send transaction after multiple attempts');
      },
    };
  }

  /**
   * Build a signAndSend function compatible with tokenCreationService.createToken()
   * and presaleService flows (they accept `(tx, signers?) => Promise<string>`).
   */
  makeSignAndSend(
    signer: LaunchpadSigner
  ): (tx: Transaction, signers?: Keypair[]) => Promise<string> {
    return (tx, signers) => signer.signAndSend(tx, signers);
  }
}

export const launchpadSigningService = new LaunchpadSigningService();
