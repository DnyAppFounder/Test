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

function diag(tag: string, ...args: any[]) {
  console.log(`[LAUNCH_DIAG] ${tag}`, ...args);
}

function diagError(tag: string, err: any) {
  console.error(`[LAUNCH_DIAG] ${tag}`, {
    name:    err?.name    ?? 'UnknownError',
    message: err?.message ?? String(err),
    logs:    (err?.logs ?? err?.simulationResponse?.logs ?? null)
               ?.join?.('\n') ?? null,
    stack:   err?.stack?.split('\n').slice(0, 5).join('\n') ?? null,
  });
}

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
 * On timeout, throws an error with .signature and .solscan so callers can surface the tx.
 */
async function pollConfirmation(
  connection: Connection,
  signature: string,
  maxAttempts = 30
): Promise<void> {
  diag('CONFIRMATION_PENDING', {
    signature,
    solscan: `https://solscan.io/tx/${signature}`,
    maxWaitSeconds: maxAttempts * 2,
  });

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const { value } = await connection.getSignatureStatuses([signature], {
        searchTransactionHistory: true,
      });
      const status = value?.[0];

      diag('CONFIRMATION_RESULT', {
        attempt: attempt + 1,
        signature: signature.slice(0, 16) + '...',
        status: status ?? 'null (not yet seen)',
        confirmationStatus: status?.confirmationStatus ?? null,
        err: status?.err ?? null,
      });

      if (status) {
        if (status.err) {
          const onChainErr: any = new Error(
            `Transaction failed on-chain: ${JSON.stringify(status.err)}`
          );
          onChainErr.signature = signature;
          onChainErr.solscan   = `https://solscan.io/tx/${signature}`;
          throw onChainErr;
        }
        const conf = status.confirmationStatus;
        if (conf === 'confirmed' || conf === 'finalized') {
          diag('CONFIRMATION_RESULT_FINAL', {
            signature,
            confirmationStatus: conf,
            solscan: `https://solscan.io/tx/${signature}`,
          });
          return;
        }
      }
    } catch (e: any) {
      if (e?.message?.startsWith('Transaction failed on-chain:')) throw e;
      console.warn(`[LaunchpadSigner] pollConfirmation attempt ${attempt + 1} network error:`, e?.message);
    }
  }

  const timeoutErr: any = new Error(
    `Confirmation timed out after ${maxAttempts * 2}s — tx may still confirm. Check Solscan: https://solscan.io/tx/${signature}`
  );
  timeoutErr.signature = signature;
  timeoutErr.solscan   = `https://solscan.io/tx/${signature}`;
  throw timeoutErr;
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
    const feePayer = keypair.publicKey;

    const connection = this.connection;
    const connSvc = SolanaConnectionService.getInstance();
    const MAX_ATTEMPTS = 3;

    return {
      publicKey: feePayer.toBase58(),
      signAndSend: async (tx: Transaction, extraSigners: Keypair[] = []) => {
        let lastError: any;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            // Fetch a fresh blockhash immediately before every signing attempt
            const bhResult = await connSvc.rpcCall('getLatestBlockhash', [{ commitment: 'confirmed' }]);
            const blockhash: string = bhResult.value.blockhash;
            const lastValidBlockHeight: number = bhResult.value.lastValidBlockHeight;

            // Rebuild a clean Transaction from the original instructions on each attempt.
            // All instructions — including the platform-fee SystemProgram.transfer — are
            // copied from tx.instructions before signing. Nothing is added or removed here.
            const freshTx = new Transaction({ recentBlockhash: blockhash, feePayer });
            for (const ix of tx.instructions) {
              freshTx.add(ix);
            }
            if (freshTx.instructions.length !== tx.instructions.length) {
              throw new Error(
                `Instruction count mismatch: expected ${tx.instructions.length}, got ${freshTx.instructions.length}`
              );
            }

            // Sign with all keypairs: fee-payer first, then extra signers (mintKeypair)
            freshTx.sign(keypair, ...extraSigners);

            diag('WALLET_SIGNATURE_SUCCESS', {
              type: 'internal',
              attempt,
              feePayer: feePayer.toBase58().slice(0, 8) + '...',
              blockhash: blockhash.slice(0, 8) + '...',
              lastValidBlockHeight,
              extraSigners: extraSigners.length,
              instructionCount: freshTx.instructions.length,
            });

            const rawTx = freshTx.serialize();
            const encodedTx = Buffer.from(rawTx).toString('base64');

            // skipPreflight: true bypasses simulation-layer blockhash checks;
            // the cluster validates the blockhash authoritatively during processing.
            const sig = await connSvc.rpcCall('sendTransaction', [
              encodedTx,
              { encoding: 'base64', skipPreflight: true, preflightCommitment: 'confirmed', maxRetries: 5 },
            ]);

            diag('RAW_TRANSACTION_SENT', {
              signature: String(sig),
              solscan: `https://solscan.io/tx/${sig}`,
              type: 'internal',
              attempt,
            });

            await pollConfirmation(connection, sig);
            return sig;

          } catch (err: any) {
            lastError = err;
            const msg = err?.message || String(err);

            // Retry only on blockhash expiry
            if ((msg.includes('blockhash') || msg.includes('BlockhashNotFound')) && attempt < MAX_ATTEMPTS) {
              console.warn(
                `[LaunchpadSigner] Internal blockhash error (attempt ${attempt}), rebuilding for attempt ${attempt + 1}...`
              );
              continue;
            }

            throw err;
          }
        }

        throw lastError ?? new Error('Internal tx failed after multiple attempts');
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

            // 2. Rebuild a clean Transaction from the original instructions.
            //    Every instruction (createAccount, initMint, metadata, ATA, mintTo,
            //    platform-fee transfer) must be present — verified by the count check below.
            const freshTx = new Transaction({ recentBlockhash: blockhash, feePayer });
            for (const ix of tx.instructions) {
              freshTx.add(ix);
            }

            diag('BUILD_TRANSACTION_START', {
              type: 'external',
              provider: providerId,
              attempt,
              instructionCount: freshTx.instructions.length,
              blockhash: blockhash.slice(0, 8) + '...',
              lastValidBlockHeight,
            });
            if (freshTx.instructions.length !== tx.instructions.length) {
              throw new Error(
                `Instruction count mismatch: expected ${tx.instructions.length}, got ${freshTx.instructions.length}`
              );
            }

            // 3. partialSign with mint keypair BEFORE external wallet signs.
            //    mintKeypair must sign first because it's a non-feePayer signer;
            //    Phantom (feePayer) adds its signature on top.
            if (extraSigners.length > 0) {
              freshTx.partialSign(...extraSigners);
            }

            // 4. External wallet (Phantom) signs — user delay happens here
            const signed = await ExternalWalletAdapter.signTransaction(providerId, freshTx);

            diag('WALLET_SIGNATURE_SUCCESS', {
              type: 'external',
              provider: providerId,
              attempt,
              blockhash: blockhash.slice(0, 8) + '...',
              lastValidBlockHeight,
              instructionCount: (signed as Transaction).instructions?.length ?? freshTx.instructions.length,
            });

            // 5. Check if the blockhash is still within its valid window after user approved
            let currentHeight = 0;
            try {
              currentHeight = await connSvc.rpcCall('getBlockHeight', []);
            } catch {
              // Non-fatal — if we can't check, proceed optimistically
            }

            if (currentHeight > 0 && currentHeight > lastValidBlockHeight) {
              if (attempt < MAX_ATTEMPTS) {
                diag('BLOCKHASH_EXPIRED_AFTER_SIGN', {
                  currentHeight, lastValidBlockHeight, attempt,
                  note: `rebuilding for attempt ${attempt + 1}`,
                });
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

            const sig = await connSvc.rpcCall('sendTransaction', [
              encodedTx,
              { encoding: 'base64', skipPreflight: true, preflightCommitment: 'confirmed', maxRetries: 5 },
            ]);

            diag('RAW_TRANSACTION_SENT', {
              signature: String(sig),
              solscan: `https://solscan.io/tx/${sig}`,
              type: 'external',
              provider: providerId,
              attempt,
            });

            await pollConfirmation(connection, sig);
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
