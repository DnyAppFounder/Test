import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';

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
  private connection: Connection;

  constructor() {
    this.connection = new Connection(
      'https://api.mainnet-beta.solana.com',
      'confirmed'
    );
  }

  async getQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    slippageBps: number = 50
  ): Promise<JupiterQuote | null> {
    try {
      const params = new URLSearchParams({
        inputMint,
        outputMint,
        amount: amount.toString(),
        slippageBps: slippageBps.toString(),
      });

      const response = await fetch(`${JUPITER_QUOTE_API}?${params.toString()}`);

      if (!response.ok) {
        console.error('Jupiter quote error:', response.status, response.statusText);
        return null;
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching Jupiter quote:', error);
      return null;
    }
  }

  async getSwapTransaction(
    quote: JupiterQuote,
    userPublicKey: string,
    wrapUnwrapSOL: boolean = true
  ): Promise<JupiterSwapResult | null> {
    try {
      const response = await fetch(JUPITER_SWAP_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey,
          wrapUnwrapSOL,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 'auto',
        }),
      });

      if (!response.ok) {
        console.error('Jupiter swap error:', response.status, response.statusText);
        return null;
      }

      const data = await response.json();
      return {
        swapTransaction: data.swapTransaction,
        lastValidBlockHeight: data.lastValidBlockHeight || 0,
      };
    } catch (error) {
      console.error('Error getting swap transaction:', error);
      return null;
    }
  }

  async executeSwap(
    serializedTransaction: string,
    signTransaction: (transaction: VersionedTransaction) => Promise<VersionedTransaction>
  ): Promise<string | null> {
    try {
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
        console.error('Transaction failed:', confirmation.value.err);
        return null;
      }

      return txid;
    } catch (error) {
      console.error('Error executing swap:', error);
      return null;
    }
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
