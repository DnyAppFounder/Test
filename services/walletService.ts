import { SecureWalletManager, WalletAccount } from '@/lib/wallet/SecureWalletManager';
import { BalanceManager } from '@/lib/wallet/BalanceManager';
import { TransactionManager, TransactionRequest } from '@/lib/wallet/TransactionManager';
import { TransactionHistoryManager, Transaction } from '@/lib/wallet/TransactionHistoryManager';
import { MnemonicManager } from '@/lib/crypto/mnemonic';
import { Token } from '@/types/crypto';

export class WalletService {
  private static walletManager = SecureWalletManager.getInstance();
  private static balanceManager = BalanceManager.getInstance();
  private static transactionManager = TransactionManager.getInstance();
  private static historyManager = TransactionHistoryManager.getInstance();

  static async hasWallet(): Promise<boolean> {
    return await this.walletManager.hasWallet();
  }

  static async isOnboardingCompleted(): Promise<boolean> {
    return await this.walletManager.isOnboardingCompleted();
  }

  static async setOnboardingCompleted(): Promise<void> {
    await this.walletManager.setOnboardingCompleted();
  }

  static generateSeedPhrase(wordCount: 12 | 24 = 12): string[] {
    const mnemonic = this.walletManager.generateMnemonic(wordCount);
    return mnemonic.split(' ');
  }

  static validateSeedPhrase(seedPhrase: string): boolean {
    return this.walletManager.validateMnemonic(seedPhrase);
  }

  static async createWallet(seedPhrase: string[], password: string): Promise<void> {
    const mnemonic = seedPhrase.join(' ');
    await this.walletManager.createWallet(mnemonic);
  }

  static async importWallet(seedPhrase: string, password: string): Promise<void> {
    await this.walletManager.createWallet(seedPhrase);
  }

  static async unlockWallet(password: string): Promise<boolean> {
    return true;
  }

  static lockWallet(): void {
    this.walletManager.lockWallet();
  }

  static isWalletUnlocked(): boolean {
    return this.walletManager.isUnlocked();
  }

  static async getAccounts(): Promise<WalletAccount[]> {
    return await this.walletManager.getAccounts();
  }

  static async addAccount(
    blockchain: 'solana' | 'ethereum' | 'polygon' | 'base',
    name?: string
  ): Promise<WalletAccount> {
    if (blockchain !== 'solana') {
      throw new Error('Only Solana blockchain is supported');
    }
    return await this.walletManager.addAccount(blockchain, name);
  }

  static async getBalance(account: WalletAccount): Promise<string> {
    const balance = await this.balanceManager.getBalance(account);
    return balance.balance;
  }

  static async getBalanceUSD(account: WalletAccount): Promise<number> {
    const balance = await this.balanceManager.getBalance(account);
    return balance.balanceUSD || 0;
  }

  static async getAllBalances(accounts: WalletAccount[]) {
    return await this.balanceManager.getAllBalances(accounts);
  }

  static async getTotalBalanceUSD(accounts: WalletAccount[]): Promise<number> {
    return await this.balanceManager.getTotalBalanceUSD(accounts);
  }

  static async sendTransaction(
    account: WalletAccount,
    to: string,
    amount: string
  ): Promise<{ success: boolean; hash?: string; error?: string }> {
    try {
      const request: TransactionRequest = {
        blockchain: account.blockchain,
        to,
        amount,
        accountIndex: account.accountIndex,
      };

      return await this.transactionManager.sendTransaction(request);
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Transaction failed',
      };
    }
  }

  static async estimateFee(
    account: WalletAccount,
    to: string,
    amount: string
  ): Promise<{ fee: string; total: string }> {
    const request: TransactionRequest = {
      blockchain: account.blockchain,
      to,
      amount,
      accountIndex: account.accountIndex,
    };

    return await this.transactionManager.estimateTransactionFee(request);
  }

  static async validateAddress(blockchain: string, address: string): Promise<boolean> {
    return await this.transactionManager.validateAddress(blockchain, address);
  }

  static async getTransactionHistory(
    account: WalletAccount,
    limit: number = 20
  ): Promise<Transaction[]> {
    return await this.historyManager.getTransactionHistory(account, limit);
  }

  static async refreshBalance(account: WalletAccount) {
    return await this.balanceManager.refreshBalance(account);
  }

  static async refreshHistory(account: WalletAccount) {
    return await this.historyManager.refreshHistory(account);
  }

  static getExplorerUrl(blockchain: string, hash: string): string {
    return this.transactionManager.getExplorerUrl(blockchain, hash);
  }

  static async exportMnemonic(password: string): Promise<string | null> {
    return this.walletManager.getMnemonic();
  }

  static async changePassword(oldPassword: string, newPassword: string): Promise<boolean> {
    return true;
  }

  static async clearWallet(): Promise<void> {
    this.balanceManager.clearCache();
    this.historyManager.clearCache();
    await this.walletManager.deleteWallet();
  }
}
