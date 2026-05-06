import { supabase } from '@/lib/supabase';

export interface TrendingScore {
  id: string;
  token_mint: string;
  score: number;
  volume_score: number;
  holder_score: number;
  buy_pressure_score: number;
  liquidity_score: number;
  social_score: number;
  growth_score: number;
  rank: number | null;
  computed_at: string;
}

export interface TrendingToken {
  mint: string;
  score: number;
  rank: number;
  badge: 'HOT' | 'RISING' | 'NEW' | null;
}

// Weights must sum to 1.0
const WEIGHTS = {
  volume: 0.30,
  holders: 0.20,
  buyPressure: 0.20,
  liquidity: 0.15,
  social: 0.10,
  growth: 0.05,
};

class TrendingService {
  private rankCache: Map<string, TrendingScore> = new Map();
  private cacheTs = 0;
  private CACHE_TTL = 60_000; // 1 minute

  async getScore(mintAddress: string): Promise<TrendingScore | null> {
    await this.refreshCacheIfStale();
    return this.rankCache.get(mintAddress) ?? null;
  }

  async getTopTokens(limit = 50): Promise<TrendingScore[]> {
    await this.refreshCacheIfStale();
    return Array.from(this.rankCache.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private async refreshCacheIfStale(): Promise<void> {
    if (Date.now() - this.cacheTs < this.CACHE_TTL) return;
    try {
      const { data } = await supabase
        .from('trending_scores')
        .select('*')
        .order('score', { ascending: false })
        .limit(200);

      if (data) {
        this.rankCache.clear();
        for (const row of data as TrendingScore[]) {
          this.rankCache.set(row.token_mint, row);
        }
        this.cacheTs = Date.now();
      }
    } catch {
      // keep stale cache
    }
  }

  /**
   * Compute and persist a trending score for a single token.
   * Called after any trade/social action on the token.
   */
  async computeAndSave(params: {
    mintAddress: string;
    volume24h: number;
    maxVolume24h: number;
    holderCount: number;
    maxHolders: number;
    buyCount24h: number;
    sellCount24h: number;
    liquidityUsd: number;
    maxLiquidity: number;
    socialInteractions: number;
    maxSocial: number;
    priceChange24h: number;
  }): Promise<TrendingScore | null> {
    const {
      mintAddress, volume24h, maxVolume24h, holderCount, maxHolders,
      buyCount24h, sellCount24h, liquidityUsd, maxLiquidity,
      socialInteractions, maxSocial, priceChange24h,
    } = params;

    const norm = (v: number, max: number) => max > 0 ? Math.min(v / max, 1) : 0;

    const totalTrades = buyCount24h + sellCount24h;
    const buyRatio = totalTrades > 0 ? buyCount24h / totalTrades : 0.5;

    const volumeScore = norm(volume24h, maxVolume24h) * 100;
    const holderScore = norm(holderCount, maxHolders) * 100;
    const buyPressureScore = buyRatio * 100;
    const liquidityScore = norm(liquidityUsd, maxLiquidity) * 100;
    const socialScore = norm(socialInteractions, maxSocial) * 100;
    const growthScore = Math.min(Math.max(priceChange24h, 0), 100);

    const composite =
      volumeScore * WEIGHTS.volume +
      holderScore * WEIGHTS.holders +
      buyPressureScore * WEIGHTS.buyPressure +
      liquidityScore * WEIGHTS.liquidity +
      socialScore * WEIGHTS.social +
      growthScore * WEIGHTS.growth;

    const scoreData = {
      token_mint: mintAddress,
      score: Math.round(composite * 10) / 10,
      volume_score: Math.round(volumeScore),
      holder_score: Math.round(holderScore),
      buy_pressure_score: Math.round(buyPressureScore),
      liquidity_score: Math.round(liquidityScore),
      social_score: Math.round(socialScore),
      growth_score: Math.round(growthScore),
      computed_at: new Date().toISOString(),
    };

    try {
      const { data } = await supabase
        .from('trending_scores')
        .upsert(scoreData, { onConflict: 'token_mint' })
        .select()
        .maybeSingle();

      if (data) {
        this.rankCache.set(mintAddress, data as TrendingScore);
      }
      return (data as TrendingScore) ?? null;
    } catch {
      return null;
    }
  }

  badge(score: TrendingScore | null, ageHours: number): TrendingToken['badge'] {
    if (!score) return null;
    if (ageHours < 2) return 'NEW';
    if (score.score >= 70) return 'HOT';
    if (score.growth_score >= 60) return 'RISING';
    return null;
  }

  badgeColor(badge: TrendingToken['badge']): string {
    switch (badge) {
      case 'HOT': return '#EF4444';
      case 'RISING': return '#10B981';
      case 'NEW': return '#3B82F6';
      default: return 'transparent';
    }
  }
}

export const trendingService = new TrendingService();
