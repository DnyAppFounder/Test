/**
 * launchpadSigningService
 *
 * Central signing abstraction for the Launchpad.
 * Supports both internal wallets (SecureWalletManager mnemonic → Keypair)
 * and external wallets (Phantom/Backpack/Solflare via ExternalWalletAdapter).
 *
 * Usage:
 *   const signer = await launchpadSigningService.getSigner(activeWallet);
 *   const sig = await signer.signAndSend(transaction, [extraSigners]);
 */

import {
  Transaction,
  Keypair,
  Connection,
  sendAndConfirmTransaction,
  VersionedTransaction,
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

    return {
      publicKey: keypair.publicKey.toBase58(),
      signAndSend: async (tx: Transaction, extraSigners: Keypair[] = []) => {
        // Refresh blockhash right before signing
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
        tx.recentBlockhash = blockhash;
        tx.feePayer = keypair.publicKey;

        const allSigners = [keypair, ...extraSigners];
        const sig = await sendAndConfirmTransaction(
          connection,
          tx,
          allSigners,
          { commitment: 'confirmed', preflightCommitment: 'confirmed' }
        );
        return sig;
      },
    };
  }

  // ── External wallet signer ─────────────────────────────────────────────────

  private externalSigner(wallet: UnifiedWallet): LaunchpadSigner {
    const providerId = wallet.providerId!;
    const connection = this.connection;

    return {
      publicKey: wallet.publicKey,
      signAndSend: async (tx: Transaction, extraSigners: Keypair[] = []) => {
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
        tx.recentBlockhash = blockhash;

        // Extra signers (e.g. mint keypair) sign first
        if (extraSigners.length > 0) {
          tx.partialSign(...extraSigners);
        }

        // User wallet signs via browser extension
        const signed = await ExternalWalletAdapter.signTransaction(providerId, tx);

        // Send raw signed transaction
        const rawTx = (signed as Transaction).serialize();
        const sig = await connection.sendRawTransaction(rawTx, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });

        await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
        return sig;
      },
    };
  }

  /**
   * Build a signAndSend function compatible with tokenCreationService.createToken()
   * and presaleService flows (they accept `(tx, signers?) => Promise<string>`).
   */
  makeSignAndSend(signer: LaunchpadSigner): (tx: Transaction, signers?: Keypair[]) => Promise<string> {
    return (tx, signers) => signer.signAndSend(tx, signers);
  }
}

export const launchpadSigningService = new LaunchpadSigningService();
