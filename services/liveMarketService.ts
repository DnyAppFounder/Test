import { dexScreenerService, DexPair } from './dexscreener/tokenDiscoveryService';
import { jupiterTokenListService, JupiterToken } from './jupiter/tokenListService';
import { tokenRegistryService } from './tokenRegistryService';

export interface LiveToken {
  id: string;
  address: string;
  name: string;
  symbol: string;
  image?: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  marketCap?: number;
  fdv?: number;
  pairAddress?: string;
  dexId?: string;
  chainId: string;
  isNew?: boolean;
  isTrending?: boolean;
  isBoosted?: boolean;
  boostCount?: number;
  pairCreatedAt?: number;
  sparkline?: number[];
}

export type MarketCategory = 'all' | 'trending' | 'new' | 'verified' | 'top_volume' | 'gainers';

class LiveMarketService {
  private convertDexPairToLiveToken(pair: DexPair): LiveToken {
    return {
      id: pair.baseToken.address,
      address: pair.baseToken.address,
      name: pair.baseToken.name,
      symbol: pair.baseToken.symbol,
      image: pair.info?.imageUrl,
      price: parseFloat(pair.priceUsd || '0'),
      priceChange24h: pair.priceChange?.h24 || 0,
      volume24h: pair.volume?.h24 || 0,
      liquidity: pair.liquidity?.usd || 0,
      marketCap: pair.marketCap,
      fdv: pair.fdv,
      pairAddress: pair.pairAddress,
      dexId: pair.dexId,
      chainId: 'solana',
      boostCount: pair.boosts?.active || 0,
      pairCreatedAt: pair.pairCreatedAt,
    };
  }

  async getTokensByCategory(category: MarketCategory): Promise<LiveToken[]> {
    try {
      let pairs: DexPair[] = [];

      switch (category) {
        case 'trending':
          pairs = await dexScreenerService.getTrendingSolanaTokens();
          break;
        case 'new':
          pairs = await dexScreenerService.getNewSolanaTokens();
          break;
        case 'verified':
          pairs = await dexScreenerService.getTrendingSolanaTokens();
          break;
        case 'top_volume':
          pairs = await dexScreenerService.getTrendingSolanaTokens();
          break;
        case 'gainers':
          pairs = await dexScreenerService.getTrendingSolanaTokens();
          break;
        case 'all':
        default:
          try {
            pairs = await dexScreenerService.getTrendingSolanaTokens();
          } catch (e) {
            console.warn('Trending failed, trying boosted:', e);
            try {
              pairs = await dexScreenerService.getBoostedSolanaTokens();
            } catch (e2) {
              console.warn('Boosted failed:', e2);
              pairs = [];
            }
          }
          break;
      }

      const tokens = pairs.map((pair) => this.convertDexPairToLiveToken(pair));

      if (category === 'top_volume') {
        tokens.sort((a, b) => b.volume24h - a.volume24h);
      }

      if (category === 'gainers') {
        tokens.sort((a, b) => b.priceChange24h - a.priceChange24h);
        return tokens.filter((t) => t.priceChange24h > 0).slice(0, 100);
      }

      if (category === 'verified') {
        return tokens.filter((t) =>
          t.liquidity > 50000 &&
          t.volume24h > 10000 &&
          (t.marketCap && t.marketCap > 100000 || true)
        ).slice(0, 100);
      }

      return tokens.slice(0, 100);
    } catch (error) {
      console.error('Error fetching tokens by category:', error);
      return [];
    }
  }

  async searchTokens(query: string): Promise<LiveToken[]> {
    try {
      // Registry search covers: DB (all discovered tokens) + DexScreener + Jupiter + on-chain
      const registryResults = await tokenRegistryService.search(query);

      if (registryResults.length > 0) {
        return registryResults.map(rt => ({
          id: rt.mint,
          address: rt.mint,
          name: rt.name,
          symbol: rt.symbol,
          image: rt.logoUri,
          price: rt.priceUsd ?? 0,
          priceChange24h: rt.priceChange24h ?? 0,
          volume24h: rt.volume24h ?? 0,
          liquidity: rt.liquidityUsd ?? 0,
          marketCap: rt.marketCap,
          pairAddress: rt.pairAddress,
          chainId: 'solana',
        }));
      }

      // Fallback: direct DexScreener search
      const dexPairs = await dexScreenerService.searchTokens(query);
      return dexPairs.map(pair => this.convertDexPairToLiveToken(pair)).slice(0, 50);
    } catch (error) {
      console.error('Error searching tokens:', error);
      return [];
    }
  }

  async getTokenDetail(addressOrId: string): Promise<LiveToken | null> {
    try {
      const pairs = await dexScreenerService.getTokenByAddress(addressOrId);
      if (pairs.length === 0) return null;

      const primaryPair = pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
      return this.convertDexPairToLiveToken(primaryPair);
    } catch (error) {
      console.error('Error getting token detail:', error);
      return null;
    }
  }

  async enrichJupiterToken(jupiterToken: JupiterToken): Promise<LiveToken> {
    const dexData = await dexScreenerService.getTokenByAddress(jupiterToken.address);

    if (dexData.length > 0) {
      const primaryPair = dexData.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
      return this.convertDexPairToLiveToken(primaryPair);
    }

    return {
      id: jupiterToken.address,
      address: jupiterToken.address,
      name: jupiterToken.name,
      symbol: jupiterToken.symbol,
      image: jupiterToken.logoURI,
      price: 0,
      priceChange24h: 0,
      volume24h: 0,
      liquidity: 0,
      chainId: 'solana',
    };
  }

  formatPrice(price: number): string {
    if (price === 0) return '$0.00';
    if (price >= 1) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (price >= 0.01) return `$${price.toFixed(4)}`;
    if (price >= 0.001) return `$${price.toFixed(5)}`;
    if (price >= 0.0001) return `$${price.toFixed(6)}`;
    if (price >= 0.00001) return `$${price.toFixed(7)}`;
    if (price >= 0.000001) return `$${price.toFixed(8)}`;

    const str = price.toFixed(10);
    const match = str.match(/^0\.0*[1-9]/);
    if (match) {
      const decimals = match[0].length - 1;
      return `$${price.toFixed(Math.min(decimals + 3, 12))}`;
    }
    return `$${price.toFixed(10)}`;
  }

  formatMarketCap(cap: number): string {
    if (cap >= 1e9) {
      const val = cap / 1e9;
      return val >= 10 ? `$${val.toFixed(1)}B` : `$${val.toFixed(2)}B`;
    }
    if (cap >= 1e6) {
      const val = cap / 1e6;
      return val >= 10 ? `$${val.toFixed(1)}M` : `$${val.toFixed(2)}M`;
    }
    if (cap >= 1e3) {
      const val = cap / 1e3;
      return val >= 100 ? `${val.toFixed(0)}K` : val >= 10 ? `${val.toFixed(1)}K` : `${val.toFixed(2)}K`;
    }
    return `$${cap.toFixed(0)}`;
  }

  formatVolume(vol: number): string {
    if (vol >= 1e9) {
      const val = vol / 1e9;
      return val >= 10 ? `${val.toFixed(1)}B` : `${val.toFixed(2)}B`;
    }
    if (vol >= 1e6) {
      const val = vol / 1e6;
      return val >= 10 ? `${val.toFixed(1)}M` : `${val.toFixed(2)}M`;
    }
    if (vol >= 1e3) {
      const val = vol / 1e3;
      return val >= 100 ? `${val.toFixed(0)}K` : val >= 10 ? `${val.toFixed(1)}K` : `${val.toFixed(2)}K`;
    }
    return `$${vol.toFixed(0)}`;
  }

  formatChange(change: number): string {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
  }

  formatTokenAge(pairCreatedAt?: number): string | null {
    if (!pairCreatedAt) return null;

    const now = Date.now();
    const ageMs = now - pairCreatedAt;

    const seconds = Math.floor(ageMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return `${seconds}s`;
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 30) return `${days}d`;
    return null;
  }

  clearCache() {
    dexScreenerService.clearCache();
    jupiterTokenListService.clearCache();
  }
}

export const liveMarketService = new LiveMarketService();
