import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { SolanaConnectionService } from '../solana/connectionService';

const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';
const JUPITER_PRICE_API = 'https://price.jup.ag/v4/price';

function getProxyBaseUrl(): string {
  const supabaseUrl = typeof process !== 'undefined'
    ? process.env?.EXPO_PUBLIC_SUPABASE_URL
    : undefined;
  if (supabaseUrl) {
    return `${supabaseUrl}/functions/v1/solana-rpc`;
  }
  return '';
}

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

async function proxyFetch(url: string, options?: RequestInit): Promise<Response> {
  // Try direct first
  try {
    const response = await fetch(url, options);
    return response;
  } catch (directErr) {
    // If direct fails, try via edge function proxy
    const proxyBase = getProxyBaseUrl();
    if (!proxyBase) throw directErr;

    const parsedUrl = new URL(url);

    // Determine action from URL
    if (parsedUrl.hostname.includes('quote-api.jup.ag') && parsedUrl.pathname.includes('/quote')) {
      const proxyUrl = `${proxyBase}?action=quote&${parsedUrl.searchParams.toString()}`;
      return fetch(proxyUrl);
    }

    if (parsedUrl.hostname.includes('quote-api.jup.ag') && parsedUrl.pathname.includes('/swap')) {
      const proxyUrl = `${proxyBase}?action=swap`;
      return fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: options?.body,
      });
    }

    if (parsedUrl.hostname.includes('price.jup.ag')) {
      const ids = parsedUrl.searchParams.get('ids') || '';
      const proxyUrl = `${proxyBase}?action=price&ids=${ids}`;
      return fetch(proxyUrl);
    }

    throw directErr;
  }
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
    console.log('[Jupiter] Quote request:', { inputMint, outputMint, amount, slippageBps });

    let response: Response;
    try {
      response = await proxyFetch(url);
    } catch (fetchErr: any) {
      const msg = fetchErr?.message || 'Network request failed';
      throw new Error(`Jupiter API unreachable: ${msg}`);
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
    const body = JSON.stringify({
      quoteResponse: quote,
      userPublicKey,
      wrapUnwrapSOL,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    });

    const response = await proxyFetch(JUPITER_SWAP_API, {
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

    // Send via RPC proxy
    const txBase64 = Buffer.from(rawTransaction).toString('base64');
    const sendResult = await connectionService.rpcCall('sendTransaction', [
      txBase64,
      { skipPreflight: true, maxRetries: 2, encoding: 'base64' },
    ]);

    const txid = sendResult;
    console.log('[Jupiter] Transaction sent:', txid);

    // Poll for confirmation
    let confirmed = false;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const status = await connectionService.rpcCall('getSignatureStatuses', [[txid]]);
        const value = status?.value?.[0];
        if (value) {
          if (value.err) {
            throw new Error(`Transaction failed on-chain: ${JSON.stringify(value.err)}`);
          }
          if (value.confirmationStatus === 'confirmed' || value.confirmationStatus === 'finalized') {
            confirmed = true;
            break;
          }
        }
      } catch (e: any) {
        if (e.message?.includes('failed on-chain')) throw e;
      }
    }

    if (!confirmed) {
      console.log('[Jupiter] Transaction not confirmed after 60s, may still succeed:', txid);
    }

    return txid;
  }

  async getTokenPrice(tokenMint: string): Promise<number> {
    try {
      const response = await proxyFetch(`${JUPITER_PRICE_API}?ids=${tokenMint}`);
      if (!response.ok) return 0;

      const data = await response.json();
      const priceData = data.data?.[tokenMint];
      return priceData?.price || 0;
    } catch (error) {
      console.error('[Jupiter] Price fetch error:', error);
      return 0;
    }
  }

  async getMultipleTokenPrices(tokenMints: string[]): Promise<Map<string, number>> {
    try {
      const ids = tokenMints.join(',');
      const response = await proxyFetch(`${JUPITER_PRICE_API}?ids=${ids}`);
      if (!response.ok) return new Map();

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
      console.error('[Jupiter] Batch price error:', error);
      return new Map();
    }
  }
}

export const jupiterSwapService = new JupiterSwapService();
