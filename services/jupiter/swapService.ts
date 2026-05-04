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
      response = await fetch(url, { headers: proxyHeaders() });
    } catch (networkErr: any) {
      const msg = networkErr?.message || String(networkErr);
      console.error('[Jupiter] Network error fetching quote:', msg);
      throw new Error(`Jupiter quote network error: ${msg}`);
    }

    const bodyText = await response.text().catch(() => '');

    if (!response.ok) {
      console.error(`[Jupiter] Quote HTTP ${response.status}:`, bodyText.slice(0, 300));
      if (response.status === 400) {
        // 400 = no route / invalid params — not an app error, return null
        console.log('[Jupiter] No route available (400)');
        return null;
      }
      throw new Error(`Jupiter quote failed (${response.status}): ${bodyText.slice(0, 200)}`);
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
      });
    } catch (networkErr: any) {
      const msg = networkErr?.message || String(networkErr);
      console.error('[Jupiter] Network error building swap tx:', msg);
      throw new Error(`Jupiter swap network error: ${msg}`);
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
      if (!response.ok) return 0;
      const data = await response.json();
      return data?.data?.[tokenMint]?.price || 0;
    } catch {
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
      if (!response.ok) return new Map();
      const data = await response.json();
      const prices = new Map<string, number>();
      for (const mint of tokenMints) {
        const price = data?.data?.[mint]?.price;
        if (price) prices.set(mint, price);
      }
      return prices;
    } catch {
      return new Map();
    }
  }
}

export const jupiterSwapService = new JupiterSwapService();
