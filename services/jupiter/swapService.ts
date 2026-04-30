import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { SolanaConnectionService } from '../solana/connectionService';

const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';
const JUPITER_PRICE_API = 'https://price.jup.ag/v4/price';

export interface JupiterQuote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: number;
  routePlan: any[];
}

export interface JupiterSwapResult {
  swapTransaction: string;
  lastValidBlockHeight: number;
}

export interface TokenPrice {
  id: string;
  mintSymbol: string;
  price: number;
  extraInfo?: {
    quotedPrice?: {
      buyPrice?: number;
      sellPrice?: number;
    };
  };
}

class JupiterSwapService {
  private get connection() {
    return SolanaConnectionService.getInstance().getConnection();
  }

  async getQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    slippageBps: number = 50
  ): Promise<JupiterQuote | null> {
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: amount.toString(),
      slippageBps: slippageBps.toString(),
    });

    const url = `${JUPITER_QUOTE_API}?${params.toString()}`;
    console.log('[Jupiter] Quote request:', { inputMint, outputMint, amount, slippageBps, url });

    let response: Response;
    try {
      response = await fetch(url);
    } catch (fetchErr: any) {
      const msg = fetchErr?.message || 'Network request failed';
      if (msg.includes('Load failed') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        throw new Error('Jupiter API unreachable. Check your internet connection or try again.');
      }
      throw new Error(`Network error: ${msg}`);
    }

    if (!response.ok) {
      if (response.status === 400) {
        const body = await response.text().catch(() => '');
        console.log('[Jupiter] No route (400):', body);
        return null;
      }
      throw new Error(`Jupiter quote failed (${response.status}): ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[Jupiter] Quote response:', { outAmount: data.outAmount, error: data.error });
    if (data.error) return null;
    return data as JupiterQuote;
  }

  async getSwapTransaction(
    quote: JupiterQuote,
    userPublicKey: string,
    wrapUnwrapSOL: boolean = true
  ): Promise<JupiterSwapResult> {
    const response = await fetch(JUPITER_SWAP_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey,
        wrapUnwrapSOL,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      throw new Error(`Jupiter swap build failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    if (!data.swapTransaction) {
      throw new Error('Jupiter returned no swapTransaction');
    }
    return {
      swapTransaction: data.swapTransaction,
      lastValidBlockHeight: data.lastValidBlockHeight || 0,
    };
  }

  async executeSwap(
    serializedTransaction: string,
    signTransaction: (transaction: VersionedTransaction) => Promise<VersionedTransaction>
  ): Promise<string> {
    const transactionBuf = Buffer.from(serializedTransaction, 'base64');
    let transaction = VersionedTransaction.deserialize(transactionBuf);

    transaction = await signTransaction(transaction);

    const rawTransaction = transaction.serialize();
    const txid = await this.connection.sendRawTransaction(rawTransaction, {
      skipPreflight: true,
      maxRetries: 2,
    });

    const confirmation = await this.connection.confirmTransaction(txid, 'confirmed');

    if (confirmation.value.err) {
      throw new Error(`Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
    }

    return txid;
  }

  async getTokenPrice(tokenMint: string): Promise<number> {
    try {
      const response = await fetch(`${JUPITER_PRICE_API}?ids=${tokenMint}`);

      if (!response.ok) {
        return 0;
      }

      const data = await response.json();
      const priceData = data.data?.[tokenMint];

      if (!priceData) {
        return 0;
      }

      return priceData.price || 0;
    } catch (error) {
      console.error('Error fetching token price:', error);
      return 0;
    }
  }

  async getMultipleTokenPrices(tokenMints: string[]): Promise<Map<string, number>> {
    try {
      const ids = tokenMints.join(',');
      const response = await fetch(`${JUPITER_PRICE_API}?ids=${ids}`);

      if (!response.ok) {
        return new Map();
      }

      const data = await response.json();
      const prices = new Map<string, number>();

      for (const mint of tokenMints) {
        const priceData = data.data?.[mint];
        if (priceData && priceData.price) {
          prices.set(mint, priceData.price);
        }
      }

      return prices;
    } catch (error) {
      console.error('Error fetching multiple token prices:', error);
      return new Map();
    }
  }

  calculatePriceImpact(quote: JupiterQuote): number {
    return quote.priceImpactPct * 100;
  }

  calculateMinimumReceived(quote: JupiterQuote, decimals: number): number {
    return parseInt(quote.otherAmountThreshold) / Math.pow(10, decimals);
  }

  formatAmount(amount: number, decimals: number): string {
    return (amount / Math.pow(10, decimals)).toFixed(decimals > 6 ? 6 : decimals);
  }
}

export const jupiterSwapService = new JupiterSwapService();
