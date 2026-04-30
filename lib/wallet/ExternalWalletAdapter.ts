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

export type ExternalWalletId = 'phantom' | 'backpack' | 'solflare' | 'solana';

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
];

type WindowWithWallets = Window & {
  phantom?: { solana?: SolanaProvider };
  backpack?: { solana?: SolanaProvider };
  solflare?: SolanaProvider;
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
    return !!(w.phantom?.solana || w.backpack?.solana || w.solflare || w.solana);
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
      default:
        return w.solana ?? null;
    }
  }

  /**
   * Connect to an extension wallet. Calls provider.connect() — this triggers
   * the wallet popup inside the app, NOT an external redirect.
   */
  static async connectExtension(id: ExternalWalletId): Promise<ConnectedExternalWallet> {
    const provider = this.getProvider(id);
    if (!provider) {
      throw new Error(`${id} wallet extension is not installed`);
    }

    const result = await provider.connect();
    const address = result.publicKey.toBase58();
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
   */
  static async restoreSession(): Promise<ConnectedExternalWallet | null> {
    try {
      const stored = await AsyncStorage.getItem(CONNECTED_WALLET_KEY);
      if (!stored) return null;

      const wallet: ConnectedExternalWallet = JSON.parse(stored);

      // Only restore if the provider is still connected
      if (Platform.OS === 'web') {
        const provider = this.getProvider(wallet.id);
        if (!provider) {
          await AsyncStorage.removeItem(CONNECTED_WALLET_KEY);
          return null;
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
