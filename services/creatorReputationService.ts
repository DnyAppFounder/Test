import { supabase } from '@/lib/supabase';

export type ReputationBadge = 'new' | 'trusted' | 'verified' | 'high_risk';

export interface CreatorReputation {
  id: string;
  wallet: string;
  launches_total: number;
  launches_successful: number;
  launches_failed: number;
  total_raised_sol: number;
  total_volume_sol: number;
  avg_lp_lock_days: number;
  community_reports: number;
  holder_growth_avg: number;
  reputation_score: number;
  badge: ReputationBadge;
  last_updated: string;
}

export interface LaunchConfig {
  id: string;
  token_id: string;
  mint_address: string | null;
  max_wallet_pct: number;
  buy_cooldown_seconds: number;
  trading_delay_seconds: number;
  lp_lock_duration_days: number;
  anti_snipe_enabled: boolean;
  suspicious_threshold: number;
  launch_delay_seconds: number;
  created_at: string;
  updated_at: string;
}

const BADGE_CONFIG: Record<ReputationBadge, { label: string; color: string; bg: string }> = {
  new:       { label: 'New Creator',      color: '#9CA3AF', bg: 'rgba(156,163,175,0.15)' },
  trusted:   { label: 'Trusted Creator',  color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
  verified:  { label: 'Verified Creator', color: '#3B82F6', bg: 'rgba(59,130,246,0.15)' },
  high_risk: { label: 'High Risk',        color: '#EF4444', bg: 'rgba(239,68,68,0.15)'  },
};

class CreatorReputationService {
  async getReputation(wallet: string): Promise<CreatorReputation | null> {
    try {
      const { data } = await supabase
        .from('creator_reputation')
        .select('*')
        .eq('wallet', wallet)
        .maybeSingle();
      return data as CreatorReputation | null;
    } catch {
      return null;
    }
  }

  async getOrCreate(wallet: string): Promise<CreatorReputation> {
    const existing = await this.getReputation(wallet);
    if (existing) return existing;

    const { data } = await supabase
      .from('creator_reputation')
      .insert({
        wallet,
        launches_total: 0,
        launches_successful: 0,
        launches_failed: 0,
        total_raised_sol: 0,
        total_volume_sol: 0,
        avg_lp_lock_days: 0,
        community_reports: 0,
        holder_growth_avg: 0,
        reputation_score: 50,
        badge: 'new',
        last_updated: new Date().toISOString(),
      })
      .select()
      .maybeSingle();

    return (data as CreatorReputation) ?? {
      id: '', wallet, launches_total: 0, launches_successful: 0, launches_failed: 0,
      total_raised_sol: 0, total_volume_sol: 0, avg_lp_lock_days: 0,
      community_reports: 0, holder_growth_avg: 0, reputation_score: 50,
      badge: 'new', last_updated: new Date().toISOString(),
    };
  }

  /** Recompute score from raw metrics and persist */
  async updateAfterLaunch(wallet: string, params: {
    success: boolean;
    raisedSol: number;
    lpLockDays: number;
    holderGrowth: number;
  }): Promise<void> {
    try {
      const rep = await this.getOrCreate(wallet);

      const newTotal = rep.launches_total + 1;
      const newSuccess = rep.launches_successful + (params.success ? 1 : 0);
      const newFailed = rep.launches_failed + (params.success ? 0 : 1);
      const newRaised = rep.total_raised_sol + params.raisedSol;
      const newLpLock = ((rep.avg_lp_lock_days * rep.launches_total) + params.lpLockDays) / newTotal;
      const newGrowth = ((rep.holder_growth_avg * rep.launches_total) + params.holderGrowth) / newTotal;

      const score = this.computeScore({
        total: newTotal,
        successRate: newSuccess / newTotal,
        raisedSol: newRaised,
        avgLpLock: newLpLock,
        communityReports: rep.community_reports,
        holderGrowth: newGrowth,
      });

      await supabase
        .from('creator_reputation')
        .update({
          launches_total: newTotal,
          launches_successful: newSuccess,
          launches_failed: newFailed,
          total_raised_sol: newRaised,
          avg_lp_lock_days: newLpLock,
          holder_growth_avg: newGrowth,
          reputation_score: score,
          badge: this.scoreToBadge(score, rep.community_reports),
          last_updated: new Date().toISOString(),
        })
        .eq('wallet', wallet);
    } catch (e) {
      console.error('[ReputationService] updateAfterLaunch error:', e);
    }
  }

  private computeScore(params: {
    total: number;
    successRate: number;
    raisedSol: number;
    avgLpLock: number;
    communityReports: number;
    holderGrowth: number;
  }): number {
    let score = 50;

    // Success rate (±30 pts)
    score += (params.successRate - 0.5) * 60;

    // Volume/raised SOL (up to +15 pts)
    score += Math.min(params.raisedSol / 100, 15);

    // LP lock quality (+10 pts max at 180d)
    score += Math.min((params.avgLpLock / 180) * 10, 10);

    // Community reports (-5 per report)
    score -= params.communityReports * 5;

    // Experience bonus (+5 for 3+ launches)
    if (params.total >= 3) score += 5;
    if (params.total >= 10) score += 5;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private scoreToBadge(score: number, reports: number): ReputationBadge {
    if (reports >= 3 || score < 30) return 'high_risk';
    if (score >= 80) return 'trusted';
    if (score >= 60) return 'trusted';
    return 'new';
  }

  badgeConfig(badge: ReputationBadge) {
    return BADGE_CONFIG[badge];
  }

  // ── Launch Config ─────────────────────────────────────────────────────────────

  async saveLaunchConfig(tokenId: string, config: Partial<LaunchConfig>): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('token_launch_config')
        .upsert({
          token_id: tokenId,
          ...config,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'token_id' });
      return !error;
    } catch {
      return false;
    }
  }

  async getLaunchConfig(tokenId: string): Promise<LaunchConfig | null> {
    try {
      const { data } = await supabase
        .from('token_launch_config')
        .select('*')
        .eq('token_id', tokenId)
        .maybeSingle();
      return data as LaunchConfig | null;
    } catch {
      return null;
    }
  }

  // ── Creator Dashboard ─────────────────────────────────────────────────────────

  async getCreatorDashboardData(wallet: string): Promise<{
    reputation: CreatorReputation;
    tokenCount: number;
    totalRaisedSol: number;
  }> {
    const [rep, tokens] = await Promise.all([
      this.getOrCreate(wallet),
      supabase.from('launchpad_tokens').select('id', { count: 'exact', head: true }).eq('creator_wallet', wallet),
    ]);

    return {
      reputation: rep,
      tokenCount: tokens.count ?? 0,
      totalRaisedSol: rep.total_raised_sol,
    };
  }
}

export const creatorReputationService = new CreatorReputationService();
