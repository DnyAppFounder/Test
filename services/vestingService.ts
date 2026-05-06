import { supabase } from '@/lib/supabase';

export type AllocationType = 'team' | 'creator' | 'advisor' | 'marketing' | 'community';
export type UnlockStyle = 'linear' | 'monthly' | 'cliff_only';

export interface VestingSchedule {
  id: string;
  token_id: string;
  mint_address: string;
  wallet: string;
  allocation_type: AllocationType;
  total_amount: number;
  released_amount: number;
  cliff_seconds: number;
  duration_seconds: number;
  start_at: string;
  unlock_style: UnlockStyle;
  created_at: string;
}

export interface VestingClaim {
  id: string;
  schedule_id: string;
  wallet: string;
  amount: number;
  tx_signature: string | null;
  claimed_at: string;
}

export interface VestingStatus {
  schedule: VestingSchedule;
  vestedAmount: number;
  claimableAmount: number;
  lockedAmount: number;
  progressPct: number;
  nextUnlockAt: Date | null;
  cliffReached: boolean;
  fullyVested: boolean;
}

export interface CreateVestingInput {
  tokenId: string;
  mintAddress: string;
  wallet: string;
  allocationType: AllocationType;
  totalAmount: number;
  cliffDays: number;
  durationDays: number;
  unlockStyle: UnlockStyle;
  startAt?: Date;
}

class VestingService {
  async createSchedule(input: CreateVestingInput): Promise<VestingSchedule | null> {
    try {
      const { data, error } = await supabase
        .from('token_vesting_schedules')
        .insert({
          token_id: input.tokenId,
          mint_address: input.mintAddress,
          wallet: input.wallet,
          allocation_type: input.allocationType,
          total_amount: input.totalAmount,
          released_amount: 0,
          cliff_seconds: input.cliffDays * 86400,
          duration_seconds: input.durationDays * 86400,
          start_at: (input.startAt ?? new Date()).toISOString(),
          unlock_style: input.unlockStyle,
        })
        .select()
        .maybeSingle();

      if (error) throw error;
      return data as VestingSchedule | null;
    } catch (e) {
      console.error('[VestingService] createSchedule error:', e);
      return null;
    }
  }

  async getSchedulesForToken(tokenId: string): Promise<VestingSchedule[]> {
    try {
      const { data } = await supabase
        .from('token_vesting_schedules')
        .select('*')
        .eq('token_id', tokenId)
        .order('created_at', { ascending: true });
      return (data as VestingSchedule[]) ?? [];
    } catch {
      return [];
    }
  }

  async getSchedulesForWallet(wallet: string): Promise<VestingSchedule[]> {
    try {
      const { data } = await supabase
        .from('token_vesting_schedules')
        .select('*')
        .eq('wallet', wallet)
        .order('created_at', { ascending: false });
      return (data as VestingSchedule[]) ?? [];
    } catch {
      return [];
    }
  }

  /** Compute how much is currently vested (claimable + already claimed) */
  computeVestedAmount(schedule: VestingSchedule, now = Date.now()): number {
    const startMs = new Date(schedule.start_at).getTime();
    const cliffMs = startMs + schedule.cliff_seconds * 1000;
    const endMs = startMs + schedule.duration_seconds * 1000;

    if (now < cliffMs) return 0;
    if (now >= endMs || schedule.duration_seconds === 0) return schedule.total_amount;

    if (schedule.unlock_style === 'cliff_only') {
      return now >= cliffMs ? schedule.total_amount : 0;
    }

    const elapsed = now - startMs;
    const duration = schedule.duration_seconds * 1000;

    if (schedule.unlock_style === 'monthly') {
      // Unlock in monthly tranches
      const monthMs = 30 * 24 * 3600 * 1000;
      const monthsElapsed = Math.floor(elapsed / monthMs);
      const totalMonths = Math.ceil(duration / monthMs);
      const perMonth = schedule.total_amount / totalMonths;
      return Math.min(monthsElapsed * perMonth, schedule.total_amount);
    }

    // linear
    return (elapsed / duration) * schedule.total_amount;
  }

  computeStatus(schedule: VestingSchedule, now = Date.now()): VestingStatus {
    const vestedAmount = this.computeVestedAmount(schedule, now);
    const claimableAmount = Math.max(vestedAmount - schedule.released_amount, 0);
    const lockedAmount = schedule.total_amount - vestedAmount;
    const progressPct = schedule.total_amount > 0 ? (vestedAmount / schedule.total_amount) * 100 : 0;
    const startMs = new Date(schedule.start_at).getTime();
    const cliffMs = startMs + schedule.cliff_seconds * 1000;
    const endMs = startMs + schedule.duration_seconds * 1000;

    let nextUnlockAt: Date | null = null;
    if (now < cliffMs) {
      nextUnlockAt = new Date(cliffMs);
    } else if (schedule.unlock_style === 'monthly' && now < endMs) {
      const monthMs = 30 * 24 * 3600 * 1000;
      const elapsed = now - startMs;
      const nextMonth = (Math.floor(elapsed / monthMs) + 1) * monthMs;
      nextUnlockAt = new Date(startMs + nextMonth);
    }

    return {
      schedule,
      vestedAmount,
      claimableAmount,
      lockedAmount,
      progressPct,
      nextUnlockAt,
      cliffReached: now >= cliffMs,
      fullyVested: vestedAmount >= schedule.total_amount,
    };
  }

  async recordClaim(
    scheduleId: string,
    wallet: string,
    amount: number,
    txSignature?: string
  ): Promise<boolean> {
    try {
      const { error: claimErr } = await supabase
        .from('token_vesting_claims')
        .insert({ schedule_id: scheduleId, wallet, amount, tx_signature: txSignature ?? null });

      if (claimErr) throw claimErr;

      // Get current released amount
      const { data: schedule } = await supabase
        .from('token_vesting_schedules')
        .select('released_amount')
        .eq('id', scheduleId)
        .maybeSingle();

      if (schedule) {
        await supabase
          .from('token_vesting_schedules')
          .update({ released_amount: (schedule as VestingSchedule).released_amount + amount })
          .eq('id', scheduleId);
      }

      return true;
    } catch {
      return false;
    }
  }

  async getClaims(scheduleId: string): Promise<VestingClaim[]> {
    try {
      const { data } = await supabase
        .from('token_vesting_claims')
        .select('*')
        .eq('schedule_id', scheduleId)
        .order('claimed_at', { ascending: false });
      return (data as VestingClaim[]) ?? [];
    } catch {
      return [];
    }
  }

  formatAmount(amount: number): string {
    if (amount >= 1e9) return `${(amount / 1e9).toFixed(2)}B`;
    if (amount >= 1e6) return `${(amount / 1e6).toFixed(2)}M`;
    if (amount >= 1e3) return `${(amount / 1e3).toFixed(1)}K`;
    return amount.toFixed(0);
  }

  formatDuration(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    if (days >= 365) return `${(days / 365).toFixed(1)}y`;
    if (days >= 30) return `${Math.floor(days / 30)}mo`;
    return `${days}d`;
  }
}

export const vestingService = new VestingService();
