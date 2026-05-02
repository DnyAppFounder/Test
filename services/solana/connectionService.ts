import { Connection } from '@solana/web3.js';

const FALLBACK_RPC = 'https://api.mainnet-beta.solana.com';

function getSupabaseRpcProxyUrl(): string {
  const supabaseUrl =
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SUPABASE_URL) ||
    '';
  if (supabaseUrl) {
    return `${supabaseUrl}/functions/v1/solana-rpc`;
  }
  return '';
}

function getSupabaseAnonKey(): string {
  return (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SUPABASE_ANON_KEY) || '';
}

function getDirectRpcUrl(): string {
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SOLANA_RPC_URL) {
    return process.env.EXPO_PUBLIC_SOLANA_RPC_URL;
  }
  return '';
}

export class SolanaConnectionService {
  private static instance: SolanaConnectionService;
  private connection: Connection;
  private proxyUrl: string;
  private directUrl: string;

  private constructor() {
    this.proxyUrl = getSupabaseRpcProxyUrl();
    this.directUrl = getDirectRpcUrl();
    const rpcUrl = this.proxyUrl || this.directUrl || FALLBACK_RPC;
    this.connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 30000,
    });
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
    return this.proxyUrl || this.directUrl || FALLBACK_RPC;
  }

  async rpcCall(method: string, params: any[]): Promise<any> {
    const url = this.proxyUrl || this.directUrl || FALLBACK_RPC;
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: String(Date.now() + Math.random()),
      method,
      params,
    });

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (url === this.proxyUrl) {
      const anonKey = getSupabaseAnonKey();
      if (anonKey) {
        headers['Authorization'] = `Bearer ${anonKey}`;
        headers['apikey'] = anonKey;
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`RPC ${method} failed HTTP ${response.status}: ${text.substring(0, 200)}`);
    }

    const json = await response.json();
    if (json.error) {
      throw new Error(`RPC ${method}: ${json.error.message || JSON.stringify(json.error)}`);
    }

    return json.result;
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
