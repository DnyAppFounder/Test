export interface TokenPrice {
  mint: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  lastUpdated: number;
}

const JUPITER_PRICE_API = 'https://price.jup.ag/v4/price';

export class SolanaPriceService {
  private priceCache: Map<string, TokenPrice>;
  private cacheExpiry: number = 30000;

  constructor() {
    this.priceCache = new Map();
  }

  async getTokenPrice(mintAddress: string): Promise<TokenPrice | null> {
    const cached = this.priceCache.get(mintAddress);
    if (cached && Date.now() - cached.lastUpdated < this.cacheExpiry) {
      return cached;
    }

    try {
      const response = await fetch(`${JUPITER_PRICE_API}?ids=${mintAddress}`);
      if (!response.ok) {
        console.log('[PriceService] API error:', response.status);
        return this.getFallback(mintAddress);
      }

      const data = await response.json();
      const priceData = data?.data?.[mintAddress];

      if (priceData && priceData.price) {
        const price: TokenPrice = {
          mint: mintAddress,
          price: priceData.price,
          priceChange24h: 0,
          volume24h: 0,
          lastUpdated: Date.now(),
        };
        this.priceCache.set(mintAddress, price);
        return price;
      }

      return this.getFallback(mintAddress);
    } catch (error) {
      console.log('[PriceService] Fetch error for', mintAddress, error);
      return this.getFallback(mintAddress);
    }
  }

  async getBatchPrices(mintAddresses: string[]): Promise<Map<string, TokenPrice>> {
    const results = new Map<string, TokenPrice>();

    const uncached: string[] = [];
    for (const mint of mintAddresses) {
      const cached = this.priceCache.get(mint);
      if (cached && Date.now() - cached.lastUpdated < this.cacheExpiry) {
        results.set(mint, cached);
      } else {
        uncached.push(mint);
      }
    }

    if (uncached.length === 0) return results;

    try {
      const ids = uncached.join(',');
      const response = await fetch(`${JUPITER_PRICE_API}?ids=${ids}`);

      if (response.ok) {
        const data = await response.json();
        for (const mint of uncached) {
          const priceData = data?.data?.[mint];
          if (priceData && priceData.price) {
            const price: TokenPrice = {
              mint,
              price: priceData.price,
              priceChange24h: 0,
              volume24h: 0,
              lastUpdated: Date.now(),
            };
            this.priceCache.set(mint, price);
            results.set(mint, price);
          }
        }
      }
    } catch (error) {
      console.log('[PriceService] Batch fetch error:', error);
    }

    return results;
  }

  async getSOLPrice(): Promise<number> {
    const solMint = 'So11111111111111111111111111111111111111112';
    const price = await this.getTokenPrice(solMint);
    return price?.price || 0;
  }

  private getFallback(mintAddress: string): TokenPrice {
    return {
      mint: mintAddress,
      price: 0,
      priceChange24h: 0,
      volume24h: 0,
      lastUpdated: Date.now(),
    };
  }

  clearCache() {
    this.priceCache.clear();
  }
}
