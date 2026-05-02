import { VersionedTransaction } from '@solana/web3.js';
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
    console.log('[Jupiter] Quote:', { inputMint: inputMint.slice(0, 8), outputMint: outputMint.slice(0, 8), amount, slippageBps });

    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 400) {
        const body = await response.text().catch(() => '');
        console.log('[Jupiter] No route (400):', body);
        return null;
      }
      throw new Error(`Jupiter quote failed (${response.status})`);
    }

    const data = await response.json();
    if (data.error) {
      console.log('[Jupiter] Quote error:', data.error);
      return null;
    }
    console.log('[Jupiter] Quote ok, outAmount:', data.outAmount);
    return data as JupiterQuote;
  }

  async getSwapTransaction(
    quote: JupiterQuote,
    userPublicKey: string,
    wrapUnwrapSOL: boolean = true
  ): Promise<JupiterSwapResult> {
    const body = JSON.stringify({
      quoteResponse: quote,
      userPublicKey,
      wrapUnwrapSOL,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    });

    const response = await fetch(JUPITER_SWAP_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
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
    const connectionService = SolanaConnectionService.getInstance();

    // Send via RPC proxy (edge function) to avoid CORS issues
    const txBase64 = Buffer.from(rawTransaction).toString('base64');
    const txid = await connectionService.rpcCall('sendTransaction', [
      txBase64,
      { skipPreflight: true, maxRetries: 2, encoding: 'base64' },
    ]);

    console.log('[Jupiter] Transaction sent:', txid);

    // Poll for confirmation via RPC proxy
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const status = await connectionService.rpcCall('getSignatureStatuses', [[txid]]);
        const value = status?.value?.[0];
        if (value) {
          if (value.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(value.err)}`);
          }
          if (value.confirmationStatus === 'confirmed' || value.confirmationStatus === 'finalized') {
            console.log('[Jupiter] Confirmed:', txid);
            return txid;
          }
        }
      } catch (e: any) {
        if (e.message?.includes('Transaction failed')) throw e;
      }
    }

    console.log('[Jupiter] Not confirmed after 60s, returning txid anyway:', txid);
    return txid;
  }

  async getTokenPrice(tokenMint: string): Promise<number> {
    try {
      const response = await fetch(`${JUPITER_PRICE_API}?ids=${tokenMint}`);
      if (!response.ok) return 0;
      const data = await response.json();
      return data.data?.[tokenMint]?.price || 0;
    } catch {
      return 0;
    }
  }

  async getMultipleTokenPrices(tokenMints: string[]): Promise<Map<string, number>> {
    try {
      const ids = tokenMints.join(',');
      const response = await fetch(`${JUPITER_PRICE_API}?ids=${ids}`);
      if (!response.ok) return new Map();
      const data = await response.json();
      const prices = new Map<string, number>();
      for (const mint of tokenMints) {
        const price = data.data?.[mint]?.price;
        if (price) prices.set(mint, price);
      }
      return prices;
    } catch {
      return new Map();
    }
  }
}

export const jupiterSwapService = new JupiterSwapService();
