/**
 * ExternalWalletAdapter
 *
 * Handles connecting external Solana wallets (Phantom, Backpack, Solflare)
 * via browser extension injection (window.solana / window.backpack / window.solflare).
 *
 * Non-custodial: we never handle private keys. Signing is delegated to the wallet provider.
 * All transactions are signed INSIDE the app via the provider's wallet popup — no redirects.
 */

import { Platform } from 'react-native';
import { PublicKey, Transaction, VersionedTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SolanaConnectionService } from '@/services/solana/connectionService';

export interface ExternalWalletInfo {
  id: ExternalWalletId;
  name: string;
  icon: string;
  deepLinkScheme?: string;
}

export type ExternalWalletId = 'phantom' | 'backpack' | 'solflare' | 'jupiter' | 'solana';

export interface ConnectedExternalWallet {
  id: ExternalWalletId;
  name: string;
  address: string;
  publicKey: string;
  balance: number;
  icon: string;
}

const CONNECTED_WALLET_KEY = 'external_wallet_connected';

export const SUPPORTED_WALLETS: ExternalWalletInfo[] = [
  {
    id: 'phantom',
    name: 'Phantom',
    icon: 'https://phantom.app/img/phantom-logo.png',
    deepLinkScheme: 'phantom',
  },
  {
    id: 'backpack',
    name: 'Backpack',
    icon: 'https://backpack.app/favicon.ico',
    deepLinkScheme: 'backpack',
  },
  {
    id: 'solflare',
    name: 'Solflare',
    icon: 'https://solflare.com/favicon.ico',
    deepLinkScheme: 'solflare',
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    icon: 'https://jup.ag/favicon.ico',
    deepLinkScheme: 'https',
  },
];

type WindowWithWallets = Window & {
  phantom?: { solana?: SolanaProvider };
  backpack?: { solana?: SolanaProvider };
  solflare?: SolanaProvider;
  // Jupiter Wallet injects as window.jupiter or window.jupiterWallet
  jupiter?: SolanaProvider;
  jupiterWallet?: SolanaProvider;
  solana?: SolanaProvider;
};

interface SolanaProvider {
  isPhantom?: boolean;
  isBackpack?: boolean;
  isSolflare?: boolean;
  publicKey: { toBase58(): string } | null;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toBase58(): string } }>;
  disconnect(): Promise<void>;
  signTransaction(tx: Transaction | VersionedTransaction): Promise<Transaction | VersionedTransaction>;
  signAllTransactions(txs: (Transaction | VersionedTransaction)[]): Promise<(Transaction | VersionedTransaction)[]>;
  signMessage(msg: Uint8Array): Promise<{ signature: Uint8Array }>;
  isConnected: boolean;
}

export class ExternalWalletAdapter {
  private static getConnection() {
    return SolanaConnectionService.getInstance().getConnection();
  }

  static getSupportedWallets(): ExternalWalletInfo[] {
    return SUPPORTED_WALLETS;
  }

  /**
   * Detect which wallet extensions are available in the current browser environment.
   * On native mobile this always returns empty — use in-app browser detection instead.
   */
  static getInstalledWallets(): ExternalWalletInfo[] {
    if (Platform.OS !== 'web') return [];
    if (typeof window === 'undefined') return [];

    const w = window as WindowWithWallets;
    const installed: ExternalWalletInfo[] = [];

    if (w.phantom?.solana?.isPhantom) {
      installed.push(SUPPORTED_WALLETS.find(x => x.id === 'phantom')!);
    }
    if (w.backpack?.solana?.isBackpack) {
      installed.push(SUPPORTED_WALLETS.find(x => x.id === 'backpack')!);
    }
    if (w.solflare?.isSolflare) {
      installed.push(SUPPORTED_WALLETS.find(x => x.id === 'solflare')!);
    }
    // Jupiter Wallet (window.jupiter or window.jupiterWallet)
    if (w.jupiter || w.jupiterWallet) {
      installed.push(SUPPORTED_WALLETS.find(x => x.id === 'jupiter')!);
    }
    // Generic window.solana (Phantom legacy fallback)
    if (w.solana?.isPhantom && !installed.find(x => x.id === 'phantom')) {
      installed.push(SUPPORTED_WALLETS.find(x => x.id === 'phantom')!);
    }

    return installed;
  }

  /**
   * Check if any wallet provider is injected (we're inside an in-app browser).
   */
  static hasAnyProvider(): boolean {
    if (Platform.OS !== 'web') return false;
    if (typeof window === 'undefined') return false;
    const w = window as WindowWithWallets;
    return !!(w.phantom?.solana || w.backpack?.solana || w.solflare || w.jupiter || w.jupiterWallet || w.solana);
  }

  static getProvider(id: ExternalWalletId): SolanaProvider | null {
    if (typeof window === 'undefined') return null;
    const w = window as WindowWithWallets;

    switch (id) {
      case 'phantom':
        return w.phantom?.solana ?? (w.solana?.isPhantom ? w.solana : null) ?? null;
      case 'backpack':
        return w.backpack?.solana ?? null;
      case 'solflare':
        return w.solflare ?? null;
      case 'jupiter':
        return w.jupiter ?? w.jupiterWallet ?? null;
      default:
        return w.solana ?? null;
    }
  }

  /**
   * Connect to an extension wallet. Calls provider.connect() — this triggers
   * the wallet popup inside the app, NOT an external redirect.
   * Times out after 30s to prevent infinite loading if wallet popup is dismissed.
   */
  static async connectExtension(id: ExternalWalletId): Promise<ConnectedExternalWallet> {
    const provider = this.getProvider(id);
    if (!provider) {
      throw new Error(`${id} wallet extension is not installed`);
    }

    // Timeout wrapper: if wallet popup is dismissed without response, reject after 30s
    const connectWithTimeout = new Promise<{ publicKey: { toBase58(): string } }>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Connection timed out. Please try again and approve the request in your wallet.'));
      }, 30000);
      // Pass { onlyIfTrusted: false } explicitly so Solflare always shows the approval popup
      provider.connect({ onlyIfTrusted: false }).then(res => { clearTimeout(timer); resolve(res); }).catch(err => { clearTimeout(timer); reject(err); });
    });

    const result = await connectWithTimeout;

    // Solflare connect() may return without publicKey populated in the result object.
    // Fall back to provider.publicKey then window.solflare?.publicKey.
    let publicKeyObj: { toBase58(): string } | null = result?.publicKey ?? null;
    if (!publicKeyObj && id === 'solflare') {
      const w = typeof window !== 'undefined' ? (window as WindowWithWallets) : null;
      publicKeyObj = provider.publicKey || (w?.solflare?.publicKey ?? null);
    }
    if (!publicKeyObj) {
      throw new Error(
        id === 'solflare'
          ? 'Solflare connection was not completed. Please approve the connection in Solflare.'
          : `${id} did not return a public key. Please try again.`
      );
    }
    const address = publicKeyObj.toBase58();
    const balance = await this.getBalance(address);

    const info = SUPPORTED_WALLETS.find(w => w.id === id)!;
    const connected: ConnectedExternalWallet = {
      id,
      name: info.name,
      address,
      publicKey: address,
      balance,
      icon: info.icon,
    };

    await AsyncStorage.setItem(CONNECTED_WALLET_KEY, JSON.stringify(connected));
    return connected;
  }

  /**
   * Disconnect the currently connected wallet extension.
   */
  static async disconnectExtension(id: ExternalWalletId): Promise<void> {
    const provider = this.getProvider(id);
    if (provider) {
      try {
        await provider.disconnect();
      } catch {
        // ignore disconnect errors
      }
    }
    await AsyncStorage.removeItem(CONNECTED_WALLET_KEY);
  }

  /**
   * Restore a previously connected wallet from storage.
   * Also handles Solflare's auto-connect where publicKey is already set.
   */
  static async restoreSession(): Promise<ConnectedExternalWallet | null> {
    try {
      const stored = await AsyncStorage.getItem(CONNECTED_WALLET_KEY);
      if (!stored) {
        // Check if Solflare is already connected (auto-connect)
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const w = window as WindowWithWallets;
          if (w.solflare?.isSolflare && w.solflare.publicKey) {
            const address = w.solflare.publicKey.toBase58();
            const balance = await this.getBalance(address);
            const info = SUPPORTED_WALLETS.find(x => x.id === 'solflare')!;
            const wallet: ConnectedExternalWallet = { id: 'solflare', name: info.name, address, publicKey: address, balance, icon: info.icon };
            await AsyncStorage.setItem(CONNECTED_WALLET_KEY, JSON.stringify(wallet));
            return wallet;
          }
        }
        return null;
      }

      const wallet: ConnectedExternalWallet = JSON.parse(stored);
      console.log('[ExternalWallet] Restoring session for:', wallet.id, wallet.address?.slice(0, 8));

      // On web, attempt to verify the provider is injected.
      // Extensions may not have injected yet at this point — DO NOT clear the session
      // if the provider is absent; just return the stored session as-is so the user
      // stays connected.  Only update the address if the provider IS available and
      // the account changed.
      if (Platform.OS === 'web') {
        const provider = this.getProvider(wallet.id);
        if (provider) {
          console.log('[ExternalWallet] Provider detected for', wallet.id, '— verifying address');
          if (provider.publicKey && provider.publicKey.toBase58() !== wallet.address) {
            wallet.address = provider.publicKey.toBase58();
            wallet.publicKey = wallet.address;
            console.log('[ExternalWallet] Address updated to', wallet.address.slice(0, 8));
          }
        } else {
          // Provider not injected yet — return stored session without modification
          // so the wallet stays "connected" in the UI. Balance will be stale but safe.
          console.log('[ExternalWallet] Provider not detected yet for', wallet.id, '— keeping stored session');
          return wallet;
        }
        // For Jupiter: also update address from provider if available
        if (wallet.id === 'jupiter') {
          const jupProvider = this.getProvider('jupiter');
          if (jupProvider?.publicKey && jupProvider.publicKey.toBase58() !== wallet.address) {
            wallet.address = jupProvider.publicKey.toBase58();
            wallet.publicKey = wallet.address;
          }
        }
      }

      wallet.balance = await this.getBalance(wallet.address);
      return wallet;
    } catch {
      return null;
    }
  }

  static async getBalance(address: string): Promise<number> {
    try {
      const result = await SolanaConnectionService.getInstance().rpcCall('getBalance', [address, { commitment: 'confirmed' }]);
      const lamports = typeof result === 'object' ? result.value : result;
      return lamports / LAMPORTS_PER_SOL;
    } catch {
      return 0;
    }
  }

  /**
   * Sign a VersionedTransaction with the connected wallet.
   * This triggers the wallet's built-in approval popup inside the app.
   * NO external redirects — signing happens entirely within the app.
   */
  static async signVersionedTransaction(
    id: ExternalWalletId,
    transaction: VersionedTransaction
  ): Promise<VersionedTransaction> {
    const provider = this.getProvider(id);
    if (!provider) throw new Error(`${id} provider not available. Ensure the wallet extension is installed.`);

    const signed = await provider.signTransaction(transaction);
    return signed as VersionedTransaction;
  }

  /**
   * Sign a legacy Transaction.
   */
  static async signTransaction(id: ExternalWalletId, transaction: Transaction): Promise<Transaction> {
    const provider = this.getProvider(id);
    if (!provider) throw new Error(`${id} provider not available`);
    const signed = await provider.signTransaction(transaction);
    return signed as Transaction;
  }

  /**
   * Sign a message with the connected wallet.
   */
  static async signMessage(id: ExternalWalletId, message: string): Promise<string> {
    const provider = this.getProvider(id);
    if (!provider) throw new Error(`${id} provider not available`);

    const encoded = new TextEncoder().encode(message);
    const { signature } = await provider.signMessage(encoded);
    return Buffer.from(signature).toString('hex');
  }

  static isProviderConnected(id: ExternalWalletId): boolean {
    const provider = this.getProvider(id);
    return provider?.isConnected ?? false;
  }
}
