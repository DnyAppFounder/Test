import { Connection } from '@solana/web3.js';
import Constants from 'expo-constants';

function getSupabaseUrl(): string {
  return (
    Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL ||
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    ''
  );
}

function getSupabaseAnonKey(): string {
  return (
    Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  );
}

function getSupabaseRpcProxyUrl(): string {
  const url = getSupabaseUrl();
  return url ? `${url}/functions/v1/solana-rpc` : '';
}

function getDirectRpcUrl(): string {
  return process.env.EXPO_PUBLIC_SOLANA_RPC_URL || '';
}

/**
 * Build a custom fetch function that injects the Supabase anon key into every
 * request made by the @solana/web3.js Connection object.
 *
 * Without this, the Supabase Edge Function proxy returns 401 for every RPC call
 * because Connection sends no Authorization or apikey header.
 */
function buildProxyFetch(anonKey: string): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    if (anonKey) {
      headers.set('Authorization', `Bearer ${anonKey}`);
      headers.set('apikey', anonKey);
    }
    return fetch(input, { ...init, headers });
  };
}

export class SolanaConnectionService {
  private static instance: SolanaConnectionService;
  private connection: Connection;
  private proxyUrl: string;
  private directUrl: string;
  private usingProxy: boolean;

  private constructor() {
    this.proxyUrl  = getSupabaseRpcProxyUrl();
    this.directUrl = getDirectRpcUrl();
    const rpcUrl   = this.proxyUrl || this.directUrl;

    if (!rpcUrl) {
      console.error(
        '[ConnectionService] FATAL: No Solana RPC URL configured.',
        'Set EXPO_PUBLIC_SOLANA_RPC_URL or EXPO_PUBLIC_SUPABASE_URL in .env'
      );
      throw new Error(
        'No Solana RPC URL configured. Set EXPO_PUBLIC_SOLANA_RPC_URL in your environment.'
      );
    }

    this.usingProxy = !!this.proxyUrl && rpcUrl === this.proxyUrl;

    console.log('[ConnectionService] RPC URL:', rpcUrl.slice(0, 80));
    console.log('[ConnectionService] Mode:', this.usingProxy ? 'Supabase proxy' : 'direct');

    if (this.usingProxy) {
      const anonKey = getSupabaseAnonKey();
      if (!anonKey) {
        console.warn('[ConnectionService] Supabase anon key not set — proxy requests will return 401');
      }
      // Pass a custom fetch that always sends the Supabase auth headers.
      // This is the only way to authorize @solana/web3.js Connection requests
      // through the Supabase Edge Function gateway.
      this.connection = new Connection(rpcUrl, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 60000,
        fetch: buildProxyFetch(anonKey) as any,
      });
    } else {
      this.connection = new Connection(rpcUrl, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 60000,
      });
    }
  }

  static getInstance(): SolanaConnectionService {
    if (!SolanaConnectionService.instance) {
      SolanaConnectionService.instance = new SolanaConnectionService();
    }
    return SolanaConnectionService.instance;
  }

  getConnection(): Connection {
    return this.connection;
  }

  getRpcUrl(): string {
    return this.proxyUrl || this.directUrl;
  }

  isUsingProxy(): boolean {
    return this.usingProxy;
  }

  /**
   * Direct JSON-RPC call with proper Supabase auth headers.
   * Used for methods where the Connection object may not be suitable
   * (e.g. websocket-requiring operations we want to force over HTTP).
   */
  async rpcCall(method: string, params: any[]): Promise<any> {
    const url = this.proxyUrl || this.directUrl;
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: String(Date.now() + Math.random()),
      method,
      params,
    });

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.usingProxy) {
      const anonKey = getSupabaseAnonKey();
      if (anonKey) {
        headers['Authorization'] = `Bearer ${anonKey}`;
        headers['apikey'] = anonKey;
      }
    }

    console.log('[RPC]', method, '->', url.slice(0, 60));

    const response = await fetch(url, { method: 'POST', headers, body });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const msg = `RPC HTTP ${response.status}: ${method} — ${text.slice(0, 200)}`;
      console.error('[RPC] Error:', msg);
      throw new Error(msg);
    }

    const json = await response.json();
    if (json.error) {
      const msg = `RPC error: ${method} → ${json.error.message || JSON.stringify(json.error)}`;
      console.error('[RPC] Error:', msg);
      throw new Error(msg);
    }

    return json.result;
  }

  async batchRpcCall(requests: Array<{ method: string; params: any[] }>): Promise<any[]> {
    const url = this.proxyUrl || this.directUrl;
    const body = requests.map((req, i) => ({
      jsonrpc: '2.0',
      id: String(i),
      method: req.method,
      params: req.params,
    }));

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.usingProxy) {
      const anonKey = getSupabaseAnonKey();
      if (anonKey) {
        headers['Authorization'] = `Bearer ${anonKey}`;
        headers['apikey'] = anonKey;
      }
    }

    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!response.ok) {
      throw new Error(`Batch RPC HTTP ${response.status}`);
    }
    const results = await response.json();
    if (!Array.isArray(results)) return requests.map(() => null);
    return results
      .sort((a: any, b: any) => Number(a.id) - Number(b.id))
      .map((r: any) => r.result ?? null);
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.rpcCall('getBlockHeight', []);
      return true;
    } catch {
      return false;
    }
  }
}
