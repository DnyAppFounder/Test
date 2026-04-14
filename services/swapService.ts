import { supabase } from '@/lib/supabase';
import { MarketService } from './marketService';

export interface SwapQuote {
  fromToken: string;
  toToken: string;
  fromAmount: number;
  toAmount: number;
  exchangeRate: number;
  priceImpact: number;
  fee: number;
  estimatedGas: number;
}

export interface SwapTransaction {
  id: string;
  user_id: string;
  from_token_id: string;
  to_token_id: string;
  from_amount: number;
  to_amount: number;
  exchange_rate: number;
  fee: number;
  status: 'pending' | 'completed' | 'failed';
  tx_hash?: string;
  created_at: string;
}

export class SwapService {
  private static readonly SWAP_FEE_PERCENT = 0.3;
  private static readonly MIN_LIQUIDITY = 1000;

  static async getSwapQuote(
    fromTokenId: string,
    toTokenId: string,
    fromAmount: number
  ): Promise<SwapQuote | null> {
    try {
      const [fromCoin, toCoin] = await Promise.all([
        MarketService.getCoinDetail(fromTokenId),
        MarketService.getCoinDetail(toTokenId),
      ]);

      if (!fromCoin || !toCoin) return null;

      const fromPrice = fromCoin.market_data.current_price.usd;
      const toPrice = toCoin.market_data.current_price.usd;

      const exchangeRate = fromPrice / toPrice;
      const toAmountBeforeFee = fromAmount * exchangeRate;

      const fee = (toAmountBeforeFee * this.SWAP_FEE_PERCENT) / 100;
      const toAmount = toAmountBeforeFee - fee;

      const priceImpact = this.calculatePriceImpact(fromAmount * fromPrice);

      const estimatedGas = 0.001;

      return {
        fromToken: fromTokenId,
        toToken: toTokenId,
        fromAmount,
        toAmount,
        exchangeRate,
        priceImpact,
        fee,
        estimatedGas,
      };
    } catch (error) {
      console.error('Error getting swap quote:', error);
      return null;
    }
  }

  private static calculatePriceImpact(tradeValueUSD: number): number {
    const liquidityRatio = tradeValueUSD / this.MIN_LIQUIDITY;
    return Math.min(liquidityRatio * 0.5, 5);
  }

  static async executeSwap(
    userId: string,
    fromTokenId: string,
    toTokenId: string,
    fromAmount: number,
    quote: SwapQuote
  ): Promise<{ success: boolean; transaction?: SwapTransaction; error?: string }> {
    try {
      const { data: fromTokenData } = await supabase
        .from('tokens')
        .select('id')
        .eq('coingecko_id', fromTokenId)
        .maybeSingle();

      const { data: toTokenData } = await supabase
        .from('tokens')
        .select('id')
        .eq('coingecko_id', toTokenId)
        .maybeSingle();

      if (!fromTokenData || !toTokenData) {
        return { success: false, error: 'Tokens not found' };
      }

      const { data: userAsset } = await supabase
        .from('user_assets')
        .select('quantity')
        .eq('user_id', userId)
        .eq('token_id', fromTokenData.id)
        .maybeSingle();

      if (!userAsset || userAsset.quantity < fromAmount) {
        return { success: false, error: 'Insufficient balance' };
      }

      const { data: swapTx, error: txError } = await supabase
        .from('user_transactions')
        .insert({
          user_id: userId,
          token_id: fromTokenData.id,
          transaction_type: 'swap',
          quantity: fromAmount,
          price_per_token: quote.exchangeRate,
          total_value: fromAmount * quote.exchangeRate,
          fee: quote.fee,
          status: 'completed',
          notes: `Swapped ${fromAmount} ${fromTokenId} to ${quote.toAmount.toFixed(6)} ${toTokenId}`,
        })
        .select()
        .single();

      if (txError) {
        return { success: false, error: 'Failed to record transaction' };
      }

      try {
        await supabase.rpc('update_user_balance_after_swap', {
          p_user_id: userId,
          p_from_token_id: fromTokenData.id,
          p_to_token_id: toTokenData.id,
          p_from_amount: fromAmount,
          p_to_amount: quote.toAmount,
        });
      } catch {
        console.log('RPC not available, manual balance update needed');
      }

      return {
        success: true,
        transaction: swapTx as SwapTransaction,
      };
    } catch (error) {
      console.error('Error executing swap:', error);
      return { success: false, error: 'Swap failed' };
    }
  }

  static async getSwapHistory(userId: string, limit = 20): Promise<SwapTransaction[]> {
    const { data } = await supabase
      .from('user_transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('transaction_type', 'swap')
      .order('created_at', { ascending: false })
      .limit(limit);

    return (data as SwapTransaction[]) || [];
  }

  static async getSupportedTokens(): Promise<Array<{ id: string; symbol: string; name: string; logo: string }>> {
    const topCoins = await MarketService.getTopCoins();
    return topCoins.map(coin => ({
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      logo: coin.image,
    }));
  }
}
