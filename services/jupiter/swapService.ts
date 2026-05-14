import { VersionedTransaction } from '@solana/web3.js';
import { SolanaConnectionService } from '../solana/connectionService';
import Constants from 'expo-constants';

// All Jupiter API calls go through the Supabase edge function proxy to avoid
// CORS issues in the browser. The proxy forwards to quote-api.jup.ag/v6/*.
function getProxyBase(): string {
  const supabaseUrl =
    Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL ||
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    '';
  if (supabaseUrl) {
    return `${supabaseUrl}/functions/v1/solana-rpc`;
  }
  return '';
}

function getAnonKey(): string {
  return (
    Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  );
}

function proxyHeaders(): Record<string, string> {
  const key = getAnonKey();
  return {
    'Content-Type': 'application/json',
    ...(key ? { Authorization: `Bearer ${key}`, apikey: key } : {}),
  };
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

class JupiterSwapService {
  async getQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    slippageBps: number = 50
  ): Promise<JupiterQuote | null> {
    // Validate inputs before sending
    if (!inputMint || inputMint.length < 32) {
      throw new Error(`Invalid inputMint: "${inputMint}"`);
    }
    if (!outputMint || outputMint.length < 32) {
      throw new Error(`Invalid outputMint: "${outputMint}"`);
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error(`Invalid amount: ${amount} (must be a positive integer in smallest unit)`);
    }
    if (slippageBps < 0 || slippageBps > 10000) {
      throw new Error(`Invalid slippageBps: ${slippageBps}`);
    }

    const proxy = getProxyBase();
    if (!proxy) {
      throw new Error('Jupiter proxy URL not configured (EXPO_PUBLIC_SUPABASE_URL missing)');
    }

    const params = new URLSearchParams({
      action: 'quote',
      inputMint,
      outputMint,
      amount: String(amount),
      slippageBps: String(slippageBps),
    });
    const url = `${proxy}?${params.toString()}`;

    console.log('[Jupiter] Quote request:', {
      inputMint: inputMint.slice(0, 8) + '...',
      outputMint: outputMint.slice(0, 8) + '...',
      amount,
      slippageBps,
      proxy: proxy.slice(0, 50),
    });

    let response: Response;
    try {
      response = await fetch(url, {
        headers: proxyHeaders(),
        signal: AbortSignal.timeout(8000),
      });
    } catch (networkErr: any) {
      const isTimeout = networkErr?.name === 'TimeoutError' || networkErr?.name === 'AbortError';
      const msg = networkErr?.message || String(networkErr);
      console.error(`[Jupiter] ${isTimeout ? 'Timeout (8s)' : 'Network error'} fetching quote @ ${Date.now()}:`, msg);
      throw new Error(`Jupiter quote ${isTimeout ? 'timed out' : 'network error'}: ${msg}`);
    }

    const bodyText = await response.text().catch(() => '');

    if (!response.ok) {
      console.error(`[Jupiter] Quote HTTP ${response.status}:`, bodyText.slice(0, 300));

      // Try to parse error body for a meaningful message
      let errData: any = null;
      try { errData = JSON.parse(bodyText); } catch {}
      const errMsg: string = errData?.error || errData?.message || bodyText.slice(0, 200);

      if (response.status === 400) {
        // 400 from Jupiter = no route or invalid params
        console.log('[Jupiter] No route available (400):', errMsg);
        return null;
      }
      if (response.status === 502 || response.status === 503) {
        // Check if the proxy forwarded a Jupiter "no route" inside a 502
        const lower = errMsg.toLowerCase();
        if (lower.includes('no route') || lower.includes('could not find') || lower.includes('liquidity')) {
          console.log('[Jupiter] No route (inside 502):', errMsg);
          return null;
        }
        throw new Error(`Jupiter unavailable (${response.status}): ${errMsg}`);
      }
      throw new Error(`Jupiter quote failed (${response.status}): ${errMsg}`);
    }

    let data: any;
    try {
      data = JSON.parse(bodyText);
    } catch {
      console.error('[Jupiter] Non-JSON quote response:', bodyText.slice(0, 300));
      throw new Error('Jupiter returned non-JSON response');
    }

    if (data?.error) {
      console.log('[Jupiter] Quote error from API:', data.error);
      return null;
    }

    if (!data?.outAmount) {
      console.error('[Jupiter] Quote missing outAmount:', JSON.stringify(data).slice(0, 200));
      return null;
    }

    console.log('[Jupiter] Quote ok — outAmount:', data.outAmount, 'routePlan length:', data.routePlan?.length);
    return data as JupiterQuote;
  }

  async getSwapTransaction(
    quote: JupiterQuote,
    userPublicKey: string,
    wrapUnwrapSOL: boolean = true
  ): Promise<JupiterSwapResult> {
    if (!userPublicKey || userPublicKey.length < 32) {
      throw new Error(`Invalid userPublicKey: "${userPublicKey}"`);
    }

    const proxy = getProxyBase();
    if (!proxy) {
      throw new Error('Jupiter proxy URL not configured (EXPO_PUBLIC_SUPABASE_URL missing)');
    }

    const swapUrl = `${proxy}?action=swap`;
    const body = JSON.stringify({
      quoteResponse: quote,
      userPublicKey,
      wrapUnwrapSOL,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    });

    console.log('[Jupiter] Building swap tx for user:', userPublicKey.slice(0, 8) + '...');

    let response: Response;
    try {
      response = await fetch(swapUrl, {
        method: 'POST',
        headers: proxyHeaders(),
        body,
        signal: AbortSignal.timeout(10000),
      });
    } catch (networkErr: any) {
      const isTimeout = networkErr?.name === 'TimeoutError' || networkErr?.name === 'AbortError';
      const msg = networkErr?.message || String(networkErr);
      console.error(`[Jupiter] ${isTimeout ? 'Timeout (10s)' : 'Network error'} building swap tx @ ${Date.now()}:`, msg);
      throw new Error(`Jupiter swap tx ${isTimeout ? 'timed out' : 'network error'}: ${msg}`);
    }

    const bodyText = await response.text().catch(() => '');
    if (!response.ok) {
      console.error(`[Jupiter] Swap build HTTP ${response.status}:`, bodyText.slice(0, 300));
      throw new Error(`Jupiter swap build failed (${response.status}): ${bodyText.slice(0, 200)}`);
    }

    let data: any;
    try {
      data = JSON.parse(bodyText);
    } catch {
      throw new Error('Jupiter swap returned non-JSON response');
    }

    if (!data?.swapTransaction) {
      console.error('[Jupiter] Swap response missing swapTransaction:', JSON.stringify(data).slice(0, 200));
      throw new Error('Jupiter returned no swapTransaction field');
    }

    console.log('[Jupiter] Swap tx built, lastValidBlockHeight:', data.lastValidBlockHeight);
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

    const txBase64 = Buffer.from(rawTransaction).toString('base64');
    console.log('[Jupiter] Sending transaction via RPC proxy...');

    const txid = await connectionService.rpcCall('sendTransaction', [
      txBase64,
      { skipPreflight: true, maxRetries: 2, encoding: 'base64' },
    ]);

    if (!txid || typeof txid !== 'string') {
      throw new Error(`RPC returned invalid txid: ${JSON.stringify(txid)}`);
    }

    console.log('[Jupiter] Transaction sent:', txid);

    // Poll for confirmation
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
            console.log('[Jupiter] Confirmed:', txid, 'status:', value.confirmationStatus);
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

  /** Format raw token amount to UI amount given decimals */
  formatAmount(rawAmount: number, decimals: number): string {
    return (rawAmount / Math.pow(10, decimals)).toFixed(decimals > 4 ? 4 : decimals);
  }

  /** Calculate price impact percentage from a quote */
  calculatePriceImpact(quote: JupiterQuote): number {
    const raw = parseFloat(String(quote.priceImpactPct));
    return isNaN(raw) ? 0 : Math.abs(raw * 100);
  }

  async getTokenPrice(tokenMint: string): Promise<number> {
    const proxy = getProxyBase();
    if (!proxy) return 0;
    try {
      const url = `${proxy}?action=price&ids=${tokenMint}`;
      const response = await fetch(url, { headers: proxyHeaders() });
      if (!response.ok) {
        console.error('[Jupiter] getTokenPrice HTTP', response.status);
        return 0;
      }
      const data = await response.json();
      // Jupiter Price API v3: { mint: { usdPrice } }
      // Legacy v6: { data: { mint: { price } } }
      const entry = data?.[tokenMint] ?? data?.data?.[tokenMint];
      return entry?.usdPrice ?? entry?.price ?? 0;
    } catch (err: any) {
      console.error('[Jupiter] getTokenPrice error:', err?.message);
      return 0;
    }
  }

  async getMultipleTokenPrices(tokenMints: string[]): Promise<Map<string, number>> {
    const proxy = getProxyBase();
    if (!proxy) return new Map();
    try {
      const ids = tokenMints.join(',');
      const url = `${proxy}?action=price&ids=${ids}`;
      const response = await fetch(url, { headers: proxyHeaders() });
      if (!response.ok) {
        console.error('[Jupiter] getMultipleTokenPrices HTTP', response.status);
        return new Map();
      }
      const data = await response.json();
      const prices = new Map<string, number>();
      // Support both v3 (top-level) and v6 (data wrapper)
      const source = data?.data ?? data;
      for (const mint of tokenMints) {
        const entry = source?.[mint];
        const price = entry?.usdPrice ?? entry?.price;
        if (typeof price === 'number' && price > 0) prices.set(mint, price);
      }
      return prices;
    } catch (err: any) {
      console.error('[Jupiter] getMultipleTokenPrices error:', err?.message);
      return new Map();
    }
  }
}

export const jupiterSwapService = new JupiterSwapService();
