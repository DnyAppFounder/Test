import { supabase } from '@/lib/supabase';

export interface StakingPool {
  id: string;
  token_id: string;
  name: string;
  apy: number;
  min_stake: number;
  lock_period_days: number;
  total_staked: number;
  is_active: boolean;
  created_at: string;
  token_symbol?: string;
  token_name?: string;
}

export interface UserStake {
  id: string;
  user_id: string;
  pool_id: string;
  amount: number;
  rewards_earned: number;
  staked_at: string;
  unlock_at: string;
  unstaked_at?: string;
  status: 'active' | 'completed' | 'withdrawn';
  pool?: StakingPool;
}

export class StakingService {
  static async getStakingPools(): Promise<StakingPool[]> {
    const { data } = await supabase
      .from('staking_pools')
      .select(`
        *,
        token:tokens(symbol, name)
      `)
      .eq('is_active', true)
      .order('apy', { ascending: false });

    if (!data) return [];

    return data.map((pool: any) => ({
      ...pool,
      token_symbol: pool.token?.symbol,
      token_name: pool.token?.name,
    }));
  }

  static async getUserStakes(userId: string): Promise<UserStake[]> {
    const { data } = await supabase
      .from('user_stakes')
      .select(`
        *,
        pool:staking_pools(*)
      `)
      .eq('user_id', userId)
      .order('staked_at', { ascending: false });

    return (data as UserStake[]) || [];
  }

  static async createStake(
    userId: string,
    poolId: string,
    amount: number
  ): Promise<{ success: boolean; stake?: UserStake; error?: string }> {
    try {
      const { data: pool } = await supabase
        .from('staking_pools')
        .select('*')
        .eq('id', poolId)
        .maybeSingle();

      if (!pool) {
        return { success: false, error: 'Pool not found' };
      }

      if (amount < pool.min_stake) {
        return { success: false, error: `Minimum stake is ${pool.min_stake}` };
      }

      const unlockDate = new Date();
      unlockDate.setDate(unlockDate.getDate() + pool.lock_period_days);

      const { data: stake, error } = await supabase
        .from('user_stakes')
        .insert({
          user_id: userId,
          pool_id: poolId,
          amount,
          unlock_at: unlockDate.toISOString(),
          status: 'active',
        })
        .select()
        .single();

      if (error) {
        return { success: false, error: 'Failed to create stake' };
      }

      await supabase
        .from('staking_pools')
        .update({ total_staked: pool.total_staked + amount })
        .eq('id', poolId);

      return { success: true, stake: stake as UserStake };
    } catch (error) {
      console.error('Error creating stake:', error);
      return { success: false, error: 'Failed to create stake' };
    }
  }

  static async withdrawStake(
    stakeId: string,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: stake } = await supabase
        .from('user_stakes')
        .select('*, pool:staking_pools(*)')
        .eq('id', stakeId)
        .eq('user_id', userId)
        .maybeSingle();

      if (!stake) {
        return { success: false, error: 'Stake not found' };
      }

      const now = new Date();
      const unlockDate = new Date(stake.unlock_at);

      if (now < unlockDate) {
        return { success: false, error: 'Stake is still locked' };
      }

      const { error } = await supabase
        .from('user_stakes')
        .update({
          status: 'withdrawn',
          unstaked_at: now.toISOString(),
        })
        .eq('id', stakeId);

      if (error) {
        return { success: false, error: 'Failed to withdraw stake' };
      }

      const pool = stake.pool as any;
      await supabase
        .from('staking_pools')
        .update({ total_staked: Math.max(0, pool.total_staked - stake.amount) })
        .eq('id', stake.pool_id);

      return { success: true };
    } catch (error) {
      console.error('Error withdrawing stake:', error);
      return { success: false, error: 'Failed to withdraw stake' };
    }
  }

  static calculateRewards(amount: number, apy: number, daysStaked: number): number {
    const dailyRate = apy / 365 / 100;
    return amount * dailyRate * daysStaked;
  }

  static getDaysUntilUnlock(unlockDate: string): number {
    const now = new Date();
    const unlock = new Date(unlockDate);
    const diffMs = unlock.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }

  static isUnlocked(unlockDate: string): boolean {
    return new Date() >= new Date(unlockDate);
  }
}
