import Constants from 'expo-constants';

const SUPABASE_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/market-data`;

const headers = {
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

export interface MarketCoin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  total_volume: number;
  sparkline_in_7d?: { price: number[] };
}

export interface CoinDetail {
  id: string;
  symbol: string;
  name: string;
  image: { large: string; small: string };
  market_data: {
    current_price: { usd: number };
    price_change_percentage_24h: number;
    market_cap: { usd: number };
    total_volume: { usd: number };
    high_24h: { usd: number };
    low_24h: { usd: number };
    circulating_supply: number;
    total_supply: number;
    ath: { usd: number };
    atl: { usd: number };
  };
  description: { en: string };
}

export class MarketService {
  static async getTopCoins(): Promise<MarketCoin[]> {
    try {
      const res = await fetch(`${FUNCTION_URL}?action=top`, { headers });
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }

  static async searchCoins(query: string): Promise<MarketCoin[]> {
    try {
      const res = await fetch(
        `${FUNCTION_URL}?action=search&query=${encodeURIComponent(query)}`,
        { headers }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return data.coins || [];
    } catch {
      return [];
    }
  }

  static async getCoinDetail(id: string): Promise<CoinDetail | null> {
    try {
      const res = await fetch(`${FUNCTION_URL}?action=coin&id=${id}`, {
        headers,
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  static formatPrice(price: number): string {
    if (price >= 1) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (price >= 0.01) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(6)}`;
  }

  static formatMarketCap(cap: number): string {
    if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
    if (cap >= 1e9) return `$${(cap / 1e9).toFixed(2)}B`;
    if (cap >= 1e6) return `$${(cap / 1e6).toFixed(2)}M`;
    return `$${cap.toLocaleString()}`;
  }

  static formatVolume(vol: number): string {
    if (vol >= 1e9) return `$${(vol / 1e9).toFixed(2)}B`;
    if (vol >= 1e6) return `$${(vol / 1e6).toFixed(2)}M`;
    if (vol >= 1e3) return `$${(vol / 1e3).toFixed(2)}K`;
    return `$${vol.toLocaleString()}`;
  }

  static formatChange(change: number): string {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
  }
}
