import { SolanaBlockchain, SolanaTransaction } from '../blockchain/solana';
import { EVMBlockchain, EVMTransaction } from '../blockchain/evm';
import { WalletAccount } from './SecureWalletManager';

export interface Transaction {
  hash: string;
  blockchain: string;
  from: string;
  to: string;
  amount: string;
  timestamp: number;
  status: 'success' | 'failed' | 'pending';
  type: 'send' | 'receive';
  fee?: string;
  explorerUrl: string;
}

export class TransactionHistoryManager {
  private static instance: TransactionHistoryManager;
  private historyCache: Map<string, Transaction[]> = new Map();
  private readonly CACHE_DURATION = 60000;
  private cacheTimestamps: Map<string, number> = new Map();

  private constructor() {}

  static getInstance(): TransactionHistoryManager {
    if (!TransactionHistoryManager.instance) {
      TransactionHistoryManager.instance = new TransactionHistoryManager();
    }
    return TransactionHistoryManager.instance;
  }

  async getTransactionHistory(
    account: WalletAccount,
    limit: number = 20,
    forceRefresh: boolean = false
  ): Promise<Transaction[]> {
    const cacheKey = `${account.blockchain}-${account.address}`;
    const cached = this.historyCache.get(cacheKey);
    const cacheTime = this.cacheTimestamps.get(cacheKey);

    if (
      !forceRefresh &&
      cached &&
      cacheTime &&
      Date.now() - cacheTime < this.CACHE_DURATION
    ) {
      return cached;
    }

    try {
      let transactions: Transaction[];

      if (account.blockchain === 'solana') {
        transactions = await this.getSolanaHistory(account.address, limit);
      } else {
        transactions = await this.getEVMHistory(
          account.blockchain,
          account.address,
          limit
        );
      }

      this.historyCache.set(cacheKey, transactions);
      this.cacheTimestamps.set(cacheKey, Date.now());

      return transactions;
    } catch (error) {
      console.error(
        `Error fetching transaction history for ${account.blockchain}:`,
        error
      );
      return cached || [];
    }
  }

  private async getSolanaHistory(
    address: string,
    limit: number
  ): Promise<Transaction[]> {
    const solana = new SolanaBlockchain('mainnet-beta');
    const solanaTransactions = await solana.getTransactionHistory(address, limit);

    return solanaTransactions.map((tx: SolanaTransaction) => ({
      hash: tx.signature,
      blockchain: 'solana',
      from: tx.from,
      to: tx.to,
      amount: tx.amount.toString(),
      timestamp: tx.timestamp || Date.now() / 1000,
      status: tx.status,
      type: tx.type,
      fee: tx.fee.toString(),
      explorerUrl: solana.getExplorerUrl(tx.signature),
    }));
  }

  private async getEVMHistory(
    blockchain: string,
    address: string,
    limit: number
  ): Promise<Transaction[]> {
    const evm = new EVMBlockchain(blockchain as any);
    const evmTransactions = await evm.getTransactionHistory(address, limit);

    return evmTransactions.map((tx: EVMTransaction) => ({
      hash: tx.hash,
      blockchain,
      from: tx.from,
      to: tx.to,
      amount: tx.value,
      timestamp: tx.timestamp,
      status: tx.status,
      type: tx.type,
      fee: tx.fee,
      explorerUrl: evm.getExplorerUrl(tx.hash),
    }));
  }

  async getTransaction(
    blockchain: string,
    hash: string
  ): Promise<Transaction | null> {
    try {
      if (blockchain === 'solana') {
        return null;
      } else {
        const evm = new EVMBlockchain(blockchain as any);
        const tx = await evm.getTransaction(hash);

        if (!tx) return null;

        return {
          hash: tx.hash,
          blockchain,
          from: tx.from,
          to: tx.to,
          amount: tx.value,
          timestamp: tx.timestamp,
          status: tx.status,
          type: tx.type,
          fee: tx.fee,
          explorerUrl: evm.getExplorerUrl(tx.hash),
        };
      }
    } catch (error) {
      console.error('Error fetching transaction:', error);
      return null;
    }
  }

  async refreshHistory(account: WalletAccount): Promise<Transaction[]> {
    return await this.getTransactionHistory(account, 20, true);
  }

  clearCache(): void {
    this.historyCache.clear();
    this.cacheTimestamps.clear();
  }

  getCachedHistory(account: WalletAccount): Transaction[] | null {
    const cacheKey = `${account.blockchain}-${account.address}`;
    return this.historyCache.get(cacheKey) || null;
  }

  async getAllHistory(accounts: WalletAccount[]): Promise<Transaction[]> {
    const historyPromises = accounts.map(account =>
      this.getTransactionHistory(account, 10)
    );

    const histories = await Promise.all(historyPromises);
    const allTransactions = histories.flat();

    allTransactions.sort((a, b) => b.timestamp - a.timestamp);

    return allTransactions;
  }

  getExplorerUrl(blockchain: string, hash: string): string {
    if (blockchain === 'solana') {
      const solana = new SolanaBlockchain('mainnet-beta');
      return solana.getExplorerUrl(hash);
    } else {
      const evm = new EVMBlockchain(blockchain as any);
      return evm.getExplorerUrl(hash);
    }
  }
}
