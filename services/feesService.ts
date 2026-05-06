import { supabase } from '@/lib/supabase';

export type FeeType = 'launch' | 'trading' | 'promotion' | 'verification' | 'presale';

export interface FeeEvent {
  id: string;
  fee_type: FeeType;
  amount_sol: number;
  amount_usd: number | null;
  token_mint: string | null;
  payer_wallet: string;
  tx_signature: string | null;
  created_at: string;
}

export interface RevenueSummary {
  totalSol: number;
  totalUsd: number;
  byType: Record<FeeType, number>;
  last24hSol: number;
  last7dSol: number;
}

// Current fee schedule (in SOL)
export const FEE_SCHEDULE: Record<FeeType, number> = {
  launch: 0.05,
  trading: 0.001,
  promotion: 0.1,
  verification: 0.25,
  presale: 0.02,
};

class FeesService {
  async recordFee(params: {
    feeType: FeeType;
    amountSol: number;
    amountUsd?: number;
    tokenMint?: string;
    payerWallet: string;
    txSignature?: string;
  }): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('fee_events')
        .insert({
          fee_type: params.feeType,
          amount_sol: params.amountSol,
          amount_usd: params.amountUsd ?? null,
          token_mint: params.tokenMint ?? null,
          payer_wallet: params.payerWallet,
          tx_signature: params.txSignature ?? null,
        });
      return !error;
    } catch {
      return false;
    }
  }

  async getRevenueSummary(): Promise<RevenueSummary> {
    try {
      const { data } = await supabase
        .from('fee_events')
        .select('fee_type, amount_sol, amount_usd, created_at');

      if (!data) return this.emptyRevenue();

      const now = Date.now();
      const day = 86_400_000;

      const summary: RevenueSummary = {
        totalSol: 0,
        totalUsd: 0,
        byType: { launch: 0, trading: 0, promotion: 0, verification: 0, presale: 0 },
        last24hSol: 0,
        last7dSol: 0,
      };

      for (const row of data) {
        summary.totalSol += row.amount_sol;
        summary.totalUsd += row.amount_usd ?? 0;
        summary.byType[row.fee_type as FeeType] += row.amount_sol;

        const ts = new Date(row.created_at).getTime();
        if (now - ts < day) summary.last24hSol += row.amount_sol;
        if (now - ts < 7 * day) summary.last7dSol += row.amount_sol;
      }

      return summary;
    } catch {
      return this.emptyRevenue();
    }
  }

  async getCreatorRevenue(walletAddress: string): Promise<RevenueSummary> {
    try {
      const { data } = await supabase
        .from('fee_events')
        .select('fee_type, amount_sol, amount_usd, created_at')
        .eq('payer_wallet', walletAddress);

      if (!data) return this.emptyRevenue();
      return this.aggregateEvents(data as FeeEvent[]);
    } catch {
      return this.emptyRevenue();
    }
  }

  async getRecentFees(limit = 20): Promise<FeeEvent[]> {
    try {
      const { data } = await supabase
        .from('fee_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      return (data as FeeEvent[]) ?? [];
    } catch {
      return [];
    }
  }

  private aggregateEvents(events: FeeEvent[]): RevenueSummary {
    const now = Date.now();
    const day = 86_400_000;
    const summary = this.emptyRevenue();

    for (const row of events) {
      summary.totalSol += row.amount_sol;
      summary.totalUsd += row.amount_usd ?? 0;
      summary.byType[row.fee_type] += row.amount_sol;

      const ts = new Date(row.created_at).getTime();
      if (now - ts < day) summary.last24hSol += row.amount_sol;
      if (now - ts < 7 * day) summary.last7dSol += row.amount_sol;
    }

    return summary;
  }

  private emptyRevenue(): RevenueSummary {
    return {
      totalSol: 0, totalUsd: 0,
      byType: { launch: 0, trading: 0, promotion: 0, verification: 0, presale: 0 },
      last24hSol: 0, last7dSol: 0,
    };
  }

  formatSol(sol: number): string {
    if (sol === 0) return '0 SOL';
    if (sol < 0.001) return `${(sol * 1000).toFixed(2)}m SOL`;
    return `${sol.toFixed(4)} SOL`;
  }
}

export const feesService = new FeesService();
