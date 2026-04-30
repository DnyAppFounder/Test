/**
 * ExternalWalletAdapter
 *
 * Handles connecting external Solana wallets (Phantom, Backpack, Solflare, etc.)
 * via browser extension injection (window.solana / window.backpack / window.solflare)
 * and mobile deep-linking for native wallet apps.
 *
 * This is non-custodial: we never handle private keys for connected wallets.
 * Signing is delegated entirely to the wallet provider.
 */

import { Platform } from 'react-native';
import { Connection, PublicKey, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ExternalWalletInfo {
  id: ExternalWalletId;
  name: string;
  icon: string;
  deepLinkScheme?: string;
  extensionKey?: string;
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

const SUPPORTED_WALLETS: ExternalWalletInfo[] = [
  {
    id: 'phantom',
    name: 'Phantom',
    icon: 'https://phantom.app/img/phantom-logo.png',
    extensionKey: 'phantom',
    deepLinkScheme: 'phantom',
  },
  {
    id: 'backpack',
    name: 'Backpack',
    icon: 'https://backpack.app/favicon.ico',
    extensionKey: 'backpack',
    deepLinkScheme: 'backpack',
  },
  {
    id: 'solflare',
    name: 'Solflare',
    icon: 'https://solflare.com/favicon.ico',
    extensionKey: 'solflare',
    deepLinkScheme: 'solflare',
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    icon: 'https://jup.ag/favicon.ico',
    extensionKey: 'jupiter',
    deepLinkScheme: 'https://jup.ag',
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
  signTransaction(tx: Transaction): Promise<Transaction>;
  signAllTransactions(txs: Transaction[]): Promise<Transaction[]>;
  signMessage(msg: Uint8Array): Promise<{ signature: Uint8Array }>;
  isConnected: boolean;
}

export class ExternalWalletAdapter {
  private static connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

  static getSupportedWallets(): ExternalWalletInfo[] {
    return SUPPORTED_WALLETS;
  }

  /**
   * Detect which wallets are available in the browser environment.
   * On mobile (React Native) this always returns empty — use deep links instead.
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
    // Generic window.solana (Phantom fallback, legacy)
    if (w.solana && !installed.find(x => x.id === 'phantom')) {
      installed.push(SUPPORTED_WALLETS.find(x => x.id === 'phantom')!);
    }

    return installed;
  }

  private static getProvider(id: ExternalWalletId): SolanaProvider | null {
    if (typeof window === 'undefined') return null;
    const w = window as WindowWithWallets;

    switch (id) {
      case 'phantom':
        return w.phantom?.solana ?? w.solana ?? null;
      case 'backpack':
        return w.backpack?.solana ?? null;
      case 'solflare':
        return w.solflare ?? null;
      default:
        return w.solana ?? null;
    }
  }

  /**
   * Connect to a browser-extension wallet. Returns the connected wallet data.
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
   * Disconnect the currently connected extension wallet.
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
   * Restore a previously connected wallet from storage (for session persistence).
   * Re-fetches balance from chain.
   */
  static async restoreSession(): Promise<ConnectedExternalWallet | null> {
    try {
      const stored = await AsyncStorage.getItem(CONNECTED_WALLET_KEY);
      if (!stored) return null;

      const wallet: ConnectedExternalWallet = JSON.parse(stored);
      // Refresh balance
      wallet.balance = await this.getBalance(wallet.address);
      return wallet;
    } catch {
      return null;
    }
  }

  /**
   * Fetch real SOL balance from chain.
   */
  static async getBalance(address: string): Promise<number> {
    try {
      const pubkey = new PublicKey(address);
      const lamports = await this.connection.getBalance(pubkey);
      return lamports / LAMPORTS_PER_SOL;
    } catch {
      return 0;
    }
  }

  /**
   * Generate the correct deep-link URL for connecting a mobile wallet app.
   * The wallet app will redirect back to the app after connection.
   *
   * Note: Full Phantom mobile deep-link spec requires app-registered URL schemes.
   * This returns the base open-in-wallet URL for app store redirect fallback.
   */
  static getMobileDeepLink(id: ExternalWalletId): string {
    const storeLinks: Record<ExternalWalletId, string> = {
      phantom: 'https://phantom.app/download',
      backpack: 'https://www.backpack.app/downloads',
      solflare: 'https://solflare.com/download',
      jupiter: 'https://jup.ag/onboarding',
      solana: 'https://solana.com/wallets',
    };
    return storeLinks[id];
  }

  /**
   * Sign a transaction with the connected wallet provider (browser extension).
   * The wallet popup will appear for the user to approve.
   */
  static async signTransaction(id: ExternalWalletId, transaction: Transaction): Promise<Transaction> {
    const provider = this.getProvider(id);
    if (!provider) throw new Error(`${id} provider not available`);
    return provider.signTransaction(transaction);
  }

  /**
   * Sign a message with the connected wallet (for auth/verification).
   */
  static async signMessage(id: ExternalWalletId, message: string): Promise<string> {
    const provider = this.getProvider(id);
    if (!provider) throw new Error(`${id} provider not available`);

    const encoded = new TextEncoder().encode(message);
    const { signature } = await provider.signMessage(encoded);
    return Buffer.from(signature).toString('hex');
  }

  /**
   * Check if a wallet is currently connected (extension has an active session).
   */
  static isProviderConnected(id: ExternalWalletId): boolean {
    const provider = this.getProvider(id);
    return provider?.isConnected ?? false;
  }
}
