import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { MnemonicManager } from '../crypto/mnemonic';
import { EncryptionManager } from '../crypto/encryption';
import { SolanaBlockchain } from '../blockchain/solana';
import { EVMBlockchain } from '../blockchain/evm';

const WALLET_KEY = 'secure_wallet_data';
const WALLET_CONFIG_KEY = 'wallet_config';
const ONBOARDING_KEY = 'onboarding_completed';
const WALLET_FALLBACK_KEY = 'wallet_data_fallback';

const DEVICE_PASSWORD = 'dny-wallet-local-encryption-key-v1';

interface WalletData {
  encryptedMnemonic: string;
  salt: string;
  createdAt: string;
  version: string;
}

interface WalletConfig {
  accounts: AccountConfig[];
  selectedAccountId: string;
}

interface AccountConfig {
  id: string;
  name: string;
  blockchain: 'solana';
  accountIndex: number;
  address: string;
  isDefault: boolean;
}

export interface WalletAccount {
  id: string;
  name: string;
  blockchain: 'solana';
  accountIndex: number;
  address: string;
  publicKey?: string;
  isDefault: boolean;
}

async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(key);
  } else {
    return SecureStore.getItemAsync(key);
  }
}

async function secureDelete(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

export class SecureWalletManager {
  private static instance: SecureWalletManager;
  private mnemonic: string | null = null;

  private constructor() {}

  static getInstance(): SecureWalletManager {
    if (!SecureWalletManager.instance) {
      SecureWalletManager.instance = new SecureWalletManager();
    }
    return SecureWalletManager.instance;
  }

  async hasWallet(): Promise<boolean> {
    try {
      const walletData = await secureGet(WALLET_KEY);
      if (walletData) return true;
      const fallback = await AsyncStorage.getItem(WALLET_FALLBACK_KEY);
      return fallback !== null;
    } catch {
      return false;
    }
  }

  async isOnboardingCompleted(): Promise<boolean> {
    try {
      const completed = await AsyncStorage.getItem(ONBOARDING_KEY);
      return completed === 'true';
    } catch {
      return false;
    }
  }

  async setOnboardingCompleted(): Promise<void> {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
  }

  generateMnemonic(wordCount: 12 | 24 = 12): string {
    const strength = wordCount === 12 ? 128 : 256;
    return MnemonicManager.generate(strength);
  }

  validateMnemonic(mnemonic: string): boolean {
    return MnemonicManager.validate(mnemonic);
  }

  async createWallet(mnemonic: string): Promise<WalletAccount[]> {
    if (!this.validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }

    const { encrypted, salt } = await EncryptionManager.encrypt(mnemonic, DEVICE_PASSWORD);

    const walletData: WalletData = {
      encryptedMnemonic: encrypted,
      salt,
      createdAt: new Date().toISOString(),
      version: '1.0.0',
    };

    const walletDataStr = JSON.stringify(walletData);
    await secureSet(WALLET_KEY, walletDataStr);
    await AsyncStorage.setItem(WALLET_FALLBACK_KEY, walletDataStr);

    const defaultAccounts = await this.generateDefaultAccounts(mnemonic);
    const config: WalletConfig = {
      accounts: defaultAccounts,
      selectedAccountId: defaultAccounts[0].id,
    };

    await AsyncStorage.setItem(WALLET_CONFIG_KEY, JSON.stringify(config));

    this.mnemonic = mnemonic;
    await this.setOnboardingCompleted();

    return defaultAccounts;
  }

  async unlockWallet(): Promise<boolean> {
    try {
      let walletDataStr = await secureGet(WALLET_KEY);
      if (!walletDataStr) {
        walletDataStr = await AsyncStorage.getItem(WALLET_FALLBACK_KEY);
      }
      if (!walletDataStr) return false;

      const walletData: WalletData = JSON.parse(walletDataStr);
      const decryptedMnemonic = await EncryptionManager.decrypt(
        walletData.encryptedMnemonic,
        DEVICE_PASSWORD,
        walletData.salt
      );

      if (!this.validateMnemonic(decryptedMnemonic)) {
        return false;
      }

      this.mnemonic = decryptedMnemonic;
      return true;
    } catch {
      return false;
    }
  }

  lockWallet(): void {
    this.mnemonic = null;
  }

  isUnlocked(): boolean {
    return this.mnemonic !== null;
  }

  getMnemonic(): string {
    if (!this.isUnlocked()) {
      throw new Error('Wallet is locked');
    }
    return this.mnemonic!;
  }

  private async generateDefaultAccounts(mnemonic: string): Promise<AccountConfig[]> {
    const accounts: AccountConfig[] = [];

    try {
      const solana = new SolanaBlockchain('mainnet-beta');
      const solanaWallet = await solana.getWallet(mnemonic, 0);
      accounts.push({
        id: 'solana-0',
        name: 'Solana Account 1',
        blockchain: 'solana',
        accountIndex: 0,
        address: solanaWallet.address,
        isDefault: true,
      });
    } catch (e) {
      console.warn('Solana derivation failed:', e);
    }

    return accounts;
  }

  async getAccounts(): Promise<WalletAccount[]> {
    try {
      const configStr = await AsyncStorage.getItem(WALLET_CONFIG_KEY);
      if (!configStr) return [];

      const config: WalletConfig = JSON.parse(configStr);
      return config.accounts.filter(acc => acc.blockchain === 'solana');
    } catch {
      return [];
    }
  }

  async addAccount(
    blockchain: 'solana',
    name?: string
  ): Promise<WalletAccount> {
    if (!this.isUnlocked()) {
      throw new Error('Wallet is locked');
    }

    const accounts = await this.getAccounts();
    const existingAccounts = accounts.filter(a => a.blockchain === blockchain);
    const accountIndex = existingAccounts.length;

    const solana = new SolanaBlockchain('mainnet-beta');
    const wallet = await solana.getWallet(this.mnemonic!, accountIndex);
    const address = wallet.address;
    const publicKey = wallet.publicKey;

    const newAccount: WalletAccount = {
      id: `${blockchain}-${accountIndex}`,
      name: name || `${blockchain.charAt(0).toUpperCase() + blockchain.slice(1)} Account ${accountIndex + 1}`,
      blockchain,
      accountIndex,
      address,
      publicKey,
      isDefault: false,
    };

    const configStr = await AsyncStorage.getItem(WALLET_CONFIG_KEY);
    const config: WalletConfig = configStr ? JSON.parse(configStr) : { accounts: [], selectedAccountId: '' };

    config.accounts.push(newAccount);
    await AsyncStorage.setItem(WALLET_CONFIG_KEY, JSON.stringify(config));

    return newAccount;
  }

  async deleteWallet(): Promise<void> {
    await secureDelete(WALLET_KEY);
    await AsyncStorage.removeItem(WALLET_FALLBACK_KEY);
    await AsyncStorage.removeItem(WALLET_CONFIG_KEY);
    await AsyncStorage.removeItem(ONBOARDING_KEY);
    this.lockWallet();
  }

  async debugDeriveAddresses(mnemonic: string): Promise<{ solana: string }> {
    const solana = new SolanaBlockchain('mainnet-beta');
    const solanaWallet = await solana.getWallet(mnemonic, 0);

    return {
      solana: solanaWallet.address,
    };
  }
}
