import { supabase } from '@/lib/supabase';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { SolanaConnectionService } from './solana/connectionService';

export interface CurveState {
  id: string;
  token_id: string;
  mint_address: string;
  supply_sold: number;
  current_price: number;
  graduation_threshold: number;
  market_cap_usd: number;
  graduated: boolean;
  graduation_tx: string | null;
  pool_address: string | null;
  created_at: string;
  updated_at: string;
}

export interface CurveQuote {
  tokensOut: number;
  pricePerToken: number;
  priceImpact: number;
  newPrice: number;
  newSupplySold: number;
}

export interface GraduationInfo {
  graduated: boolean;
  progress: number;
  remainingUsd: number;
  currentMarketCap: number;
  threshold: number;
}

// DAWEN Curve: price = BASE_PRICE * e^(CURVE_EXP * supplySold / totalSupply)
// Starts cheap, grows exponentially as more tokens are sold
const BASE_PRICE_SOL = 0.000001;   // starting price in SOL
const CURVE_EXP = 4.0;             // steepness — higher = faster graduation
const DEFAULT_GRADUATION_USD = 50000; // $50k market cap triggers graduation

function exponentialPrice(supplySold: number, totalSupply: number): number {
  if (totalSupply <= 0) return BASE_PRICE_SOL;
  const t = supplySold / totalSupply;
  return BASE_PRICE_SOL * Math.exp(CURVE_EXP * t);
}

// Integral of price function for exact cost calculation
function integralCost(from: number, to: number, totalSupply: number): number {
  // ∫ BASE * e^(EXP * t / T) dt from `from` to `to`
  // = BASE * T / EXP * (e^(EXP * to/T) - e^(EXP * from/T))
  if (totalSupply <= 0) return 0;
  const coeff = (BASE_PRICE_SOL * totalSupply) / CURVE_EXP;
  const upper = Math.exp(CURVE_EXP * (to / totalSupply));
  const lower = Math.exp(CURVE_EXP * (from / totalSupply));
  return coeff * (upper - lower);
}

class DawenCurveService {
  private connection: Connection;

  constructor() {
    this.connection = SolanaConnectionService.getInstance().getConnection();
  }

  /** Get or initialise a curve state for a launchpad token */
  async getCurveState(tokenId: string): Promise<CurveState | null> {
    try {
      const { data } = await supabase
        .from('dawen_curve_state')
        .select('*')
        .eq('token_id', tokenId)
        .maybeSingle();
      return data as CurveState | null;
    } catch {
      return null;
    }
  }

  async getCurveStateByMint(mintAddress: string): Promise<CurveState | null> {
    try {
      const { data } = await supabase
        .from('dawen_curve_state')
        .select('*')
        .eq('mint_address', mintAddress)
        .maybeSingle();
      return data as CurveState | null;
    } catch {
      return null;
    }
  }

  async initCurveState(
    tokenId: string,
    mintAddress: string,
    totalSupply: number,
    graduationThresholdUsd = DEFAULT_GRADUATION_USD
  ): Promise<CurveState | null> {
    try {
      const { data, error } = await supabase
        .from('dawen_curve_state')
        .upsert({
          token_id: tokenId,
          mint_address: mintAddress,
          supply_sold: 0,
          current_price: BASE_PRICE_SOL,
          graduation_threshold: graduationThresholdUsd,
          market_cap_usd: 0,
          graduated: false,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'token_id' })
        .select()
        .maybeSingle();
      if (error) throw error;
      return data as CurveState | null;
    } catch (e) {
      console.error('[DawenCurve] initCurveState error:', e);
      return null;
    }
  }

  /** Quote: how many tokens for `solAmount` SOL at current curve position */
  quoteBuy(supplySold: number, totalSupply: number, solAmount: number): CurveQuote {
    // Binary search: find tokensOut such that integralCost(supplySold, supplySold + tokensOut) ≈ solAmount
    let lo = 0;
    let hi = totalSupply - supplySold;
    let mid = 0;

    for (let i = 0; i < 64; i++) {
      mid = (lo + hi) / 2;
      const cost = integralCost(supplySold, supplySold + mid, totalSupply);
      if (cost < solAmount) lo = mid;
      else hi = mid;
    }

    const tokensOut = mid;
    const newSupplySold = supplySold + tokensOut;
    const newPrice = exponentialPrice(newSupplySold, totalSupply);
    const avgPrice = tokensOut > 0 ? solAmount / tokensOut : newPrice;
    const priceImpact = newPrice > 0 ? ((newPrice - exponentialPrice(supplySold, totalSupply)) / exponentialPrice(supplySold, totalSupply)) * 100 : 0;

    return { tokensOut, pricePerToken: avgPrice, priceImpact, newPrice, newSupplySold };
  }

  /** Quote: how much SOL for selling `tokenAmount` tokens */
  quoteSell(supplySold: number, totalSupply: number, tokenAmount: number): { solOut: number; pricePerToken: number; newPrice: number } {
    const sell = Math.min(tokenAmount, supplySold);
    const solOut = integralCost(supplySold - sell, supplySold, totalSupply);
    const newPrice = exponentialPrice(supplySold - sell, totalSupply);
    const pricePerToken = sell > 0 ? solOut / sell : newPrice;
    return { solOut, pricePerToken, newPrice };
  }

  /** Current price in SOL for a given curve state */
  currentPrice(state: CurveState, totalSupply: number): number {
    return exponentialPrice(state.supply_sold, totalSupply);
  }

  /** Graduation info */
  graduationInfo(state: CurveState, solPriceUsd: number): GraduationInfo {
    const currentMcapUsd = state.market_cap_usd;
    const progress = Math.min((currentMcapUsd / state.graduation_threshold) * 100, 100);
    return {
      graduated: state.graduated,
      progress,
      remainingUsd: Math.max(state.graduation_threshold - currentMcapUsd, 0),
      currentMarketCap: currentMcapUsd,
      threshold: state.graduation_threshold,
    };
  }

  /** Update curve state after a buy */
  async recordBuy(
    tokenId: string,
    tokensOut: number,
    solIn: number,
    newPrice: number,
    solPriceUsd: number,
    totalSupply: number
  ): Promise<void> {
    try {
      const state = await this.getCurveState(tokenId);
      if (!state) return;

      const newSupplySold = state.supply_sold + tokensOut;
      const mcapUsd = exponentialPrice(newSupplySold, totalSupply) * totalSupply * solPriceUsd;

      const updates: Partial<CurveState> = {
        supply_sold: newSupplySold,
        current_price: newPrice,
        market_cap_usd: mcapUsd,
        updated_at: new Date().toISOString(),
      };

      if (mcapUsd >= state.graduation_threshold && !state.graduated) {
        updates.graduated = true;
      }

      await supabase
        .from('dawen_curve_state')
        .update(updates)
        .eq('token_id', tokenId);
    } catch (e) {
      console.error('[DawenCurve] recordBuy error:', e);
    }
  }

  /** Subscribe to real-time curve updates */
  subscribeToCurve(tokenId: string, cb: (state: CurveState) => void): () => void {
    const channel = supabase
      .channel(`curve:${tokenId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'dawen_curve_state', filter: `token_id=eq.${tokenId}` },
        (payload) => cb(payload.new as CurveState)
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }

  formatPrice(sol: number): string {
    if (sol < 0.000001) return sol.toExponential(2);
    if (sol < 0.001) return sol.toFixed(6);
    if (sol < 1) return sol.toFixed(4);
    return sol.toFixed(2);
  }

  formatMarketCap(usd: number): string {
    if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
    if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`;
    return `$${usd.toFixed(0)}`;
  }
}

export const dawenCurveService = new DawenCurveService();
