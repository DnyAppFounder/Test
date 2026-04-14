import { supabase } from '@/lib/supabase';

export interface PortfolioSnapshot {
  id: string;
  user_id: string;
  wallet_address: string;
  total_value: number;
  snapshot_date: string;
  created_at: string;
}

export interface PortfolioChartData {
  timestamp: number;
  value: number;
  date: string;
}

export class PortfolioHistoryService {
  static async recordSnapshot(walletAddress: string, totalValue: number): Promise<void> {
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('wallet_address', walletAddress)
        .maybeSingle();

      if (!profile) {
        const { data: newProfile } = await supabase
          .from('user_profiles')
          .insert({
            wallet_address: walletAddress,
            username: `user_${walletAddress.slice(0, 8)}`,
          })
          .select()
          .single();

        if (!newProfile) return;

        await supabase.from('portfolio_snapshots').insert({
          user_id: newProfile.id,
          wallet_address: walletAddress,
          total_value: totalValue,
          snapshot_date: new Date().toISOString(),
        });
        return;
      }

      await supabase.from('portfolio_snapshots').insert({
        user_id: profile.id,
        wallet_address: walletAddress,
        total_value: totalValue,
        snapshot_date: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error recording portfolio snapshot:', error);
    }
  }

  static async getPortfolioHistory(
    walletAddress: string,
    days: number = 7
  ): Promise<PortfolioChartData[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await supabase
        .from('portfolio_snapshots')
        .select('total_value, snapshot_date')
        .eq('wallet_address', walletAddress)
        .gte('snapshot_date', startDate.toISOString())
        .order('snapshot_date', { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        return [];
      }

      return data.map((snapshot) => ({
        timestamp: new Date(snapshot.snapshot_date).getTime(),
        value: snapshot.total_value,
        date: new Date(snapshot.snapshot_date).toLocaleDateString(),
      }));
    } catch (error) {
      console.error('Error fetching portfolio history:', error);
      return [];
    }
  }

  static async getPerformanceMetrics(walletAddress: string): Promise<{
    currentValue: number;
    changeAmount: number;
    changePercent: number;
    periodStart: string;
  } | null> {
    try {
      const history = await this.getPortfolioHistory(walletAddress, 7);

      if (history.length < 2) {
        return null;
      }

      const firstSnapshot = history[0];
      const lastSnapshot = history[history.length - 1];

      const changeAmount = lastSnapshot.value - firstSnapshot.value;
      const changePercent = firstSnapshot.value > 0
        ? (changeAmount / firstSnapshot.value) * 100
        : 0;

      return {
        currentValue: lastSnapshot.value,
        changeAmount,
        changePercent,
        periodStart: firstSnapshot.date,
      };
    } catch (error) {
      console.error('Error calculating performance metrics:', error);
      return null;
    }
  }

  static async cleanupOldSnapshots(daysToKeep: number = 30): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      await supabase
        .from('portfolio_snapshots')
        .delete()
        .lt('snapshot_date', cutoffDate.toISOString());
    } catch (error) {
      console.error('Error cleaning up old snapshots:', error);
    }
  }
}
