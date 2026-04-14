import { SolanaBlockchain } from '../blockchain/solana';
import { EVMBlockchain } from '../blockchain/evm';
import { WalletAccount } from './SecureWalletManager';

export interface Balance {
  address: string;
  blockchain: string;
  balance: string;
  balanceUSD?: number;
  lastUpdated: number;
}

export interface PriceData {
  usd: number;
  eur: number;
  change24h: number;
}

export class BalanceManager {
  private static instance: BalanceManager;
  private balanceCache: Map<string, Balance> = new Map();
  private priceCache: Map<string, PriceData> = new Map();
  private readonly CACHE_DURATION = 30000;

  private constructor() {}

  static getInstance(): BalanceManager {
    if (!BalanceManager.instance) {
      BalanceManager.instance = new BalanceManager();
    }
    return BalanceManager.instance;
  }

  async getBalance(account: WalletAccount): Promise<Balance> {
    const cacheKey = `${account.blockchain}-${account.address}`;
    const cached = this.balanceCache.get(cacheKey);

    if (cached && Date.now() - cached.lastUpdated < this.CACHE_DURATION) {
      return cached;
    }

    try {
      let balance: string;

      if (account.blockchain === 'solana') {
        const solana = new SolanaBlockchain('mainnet-beta');
        balance = (await solana.getBalance(account.address)).toString();
      } else {
        const evm = new EVMBlockchain(account.blockchain);
        balance = await evm.getBalance(account.address);
      }

      const price = await this.getPrice(account.blockchain);
      const balanceUSD = parseFloat(balance) * price.usd;

      const balanceData: Balance = {
        address: account.address,
        blockchain: account.blockchain,
        balance,
        balanceUSD,
        lastUpdated: Date.now(),
      };

      this.balanceCache.set(cacheKey, balanceData);
      return balanceData;
    } catch (error) {
      console.error(`Error fetching balance for ${account.blockchain}:`, error);

      return {
        address: account.address,
        blockchain: account.blockchain,
        balance: '0',
        balanceUSD: 0,
        lastUpdated: Date.now(),
      };
    }
  }

  async getAllBalances(accounts: WalletAccount[]): Promise<Balance[]> {
    const balancePromises = accounts.map(account => this.getBalance(account));
    return await Promise.all(balancePromises);
  }

  async getTotalBalanceUSD(accounts: WalletAccount[]): Promise<number> {
    const balances = await this.getAllBalances(accounts);
    return balances.reduce((total, balance) => total + (balance.balanceUSD || 0), 0);
  }

  private async getPrice(blockchain: string): Promise<PriceData> {
    const cached = this.priceCache.get(blockchain);

    if (cached && Date.now() - cached.change24h < this.CACHE_DURATION) {
      return cached;
    }

    try {
      const coinIds: Record<string, string> = {
        solana: 'solana',
        ethereum: 'ethereum',
        polygon: 'matic-network',
        base: 'ethereum',
      };

      const coinId = coinIds[blockchain];
      if (!coinId) {
        throw new Error(`Unknown blockchain: ${blockchain}`);
      }

      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd,eur&include_24hr_change=true`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch price data');
      }

      const data = await response.json();
      const coinData = data[coinId];

      if (!coinData) {
        throw new Error('No price data available');
      }

      const priceData: PriceData = {
        usd: coinData.usd || 0,
        eur: coinData.eur || 0,
        change24h: coinData.usd_24h_change || 0,
      };

      this.priceCache.set(blockchain, priceData);
      return priceData;
    } catch (error) {
      console.error(`Error fetching price for ${blockchain}:`, error);

      const fallbackPrices: Record<string, PriceData> = {
        solana: { usd: 100, eur: 90, change24h: 0 },
        ethereum: { usd: 2000, eur: 1800, change24h: 0 },
        polygon: { usd: 0.8, eur: 0.72, change24h: 0 },
        base: { usd: 2000, eur: 1800, change24h: 0 },
      };

      return fallbackPrices[blockchain] || { usd: 0, eur: 0, change24h: 0 };
    }
  }

  async refreshBalance(account: WalletAccount): Promise<Balance> {
    const cacheKey = `${account.blockchain}-${account.address}`;
    this.balanceCache.delete(cacheKey);
    return await this.getBalance(account);
  }

  clearCache(): void {
    this.balanceCache.clear();
    this.priceCache.clear();
  }

  getCachedBalance(account: WalletAccount): Balance | null {
    const cacheKey = `${account.blockchain}-${account.address}`;
    return this.balanceCache.get(cacheKey) || null;
  }
}
