export interface TokenPrice {
  mint: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  lastUpdated: number;
}

const MOCK_PRICES: Record<string, TokenPrice> = {
  'So11111111111111111111111111111111111111112': {
    mint: 'So11111111111111111111111111111111111111112',
    price: 180.5,
    priceChange24h: 2.3,
    volume24h: 2500000000,
    lastUpdated: Date.now(),
  },
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': {
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    price: 1.0,
    priceChange24h: 0.01,
    volume24h: 5000000000,
    lastUpdated: Date.now(),
  },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': {
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    price: 1.0,
    priceChange24h: -0.02,
    volume24h: 4500000000,
    lastUpdated: Date.now(),
  },
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': {
    mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
    price: 198.2,
    priceChange24h: 2.5,
    volume24h: 15000000,
    lastUpdated: Date.now(),
  },
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs': {
    mint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
    price: 3200.0,
    priceChange24h: 1.8,
    volume24h: 12000000000,
    lastUpdated: Date.now(),
  },
};

export class SolanaPriceService {
  private priceCache: Map<string, TokenPrice>;
  private cacheExpiry: number = 60000;

  constructor() {
    this.priceCache = new Map();
  }

  async getTokenPrice(mintAddress: string): Promise<TokenPrice | null> {
    const cached = this.priceCache.get(mintAddress);
    if (cached && Date.now() - cached.lastUpdated < this.cacheExpiry) {
      return cached;
    }

    if (MOCK_PRICES[mintAddress]) {
      const price = {
        ...MOCK_PRICES[mintAddress],
        lastUpdated: Date.now(),
      };
      this.priceCache.set(mintAddress, price);
      return price;
    }

    const fallbackPrice: TokenPrice = {
      mint: mintAddress,
      price: 0,
      priceChange24h: 0,
      volume24h: 0,
      lastUpdated: Date.now(),
    };

    this.priceCache.set(mintAddress, fallbackPrice);
    return fallbackPrice;
  }

  async getBatchPrices(mintAddresses: string[]): Promise<Map<string, TokenPrice>> {
    const results = new Map<string, TokenPrice>();

    await Promise.all(
      mintAddresses.map(async (mint) => {
        const price = await this.getTokenPrice(mint);
        if (price) {
          results.set(mint, price);
        }
      })
    );

    return results;
  }

  getSOLPrice(): number {
    return MOCK_PRICES['So11111111111111111111111111111111111111112']?.price || 180.5;
  }

  clearCache() {
    this.priceCache.clear();
  }
}
