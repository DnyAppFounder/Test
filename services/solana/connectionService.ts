import { Connection } from '@solana/web3.js';
import Constants from 'expo-constants';

function getSupabaseUrl(): string {
  return Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
}

function getSupabaseRpcProxyUrl(): string {
  const supabaseUrl = getSupabaseUrl();
  if (supabaseUrl) {
    return `${supabaseUrl}/functions/v1/solana-rpc`;
  }
  return '';
}

function getSupabaseAnonKey(): string {
  return Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
}

function getDirectRpcUrl(): string {
  return process.env.EXPO_PUBLIC_SOLANA_RPC_URL || '';
}

export class SolanaConnectionService {
  private static instance: SolanaConnectionService;
  private connection: Connection;
  private proxyUrl: string;
  private directUrl: string;

  private constructor() {
    this.proxyUrl = getSupabaseRpcProxyUrl();
    this.directUrl = getDirectRpcUrl();
    const rpcUrl = this.proxyUrl || this.directUrl;
    if (!rpcUrl) {
      console.error('[ConnectionService] RPC error: No RPC URL configured. Set EXPO_PUBLIC_SOLANA_RPC_URL or EXPO_PUBLIC_SUPABASE_URL in your environment.');
      throw new Error('RPC error: No Solana RPC URL configured. Set EXPO_PUBLIC_SOLANA_RPC_URL.');
    }
    this.connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 30000,
    });
    console.log('[ConnectionService] Proxy URL:', this.proxyUrl || 'none');
    console.log('[ConnectionService] Direct URL:', this.directUrl || 'none (using proxy)');
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

  async rpcCall(method: string, params: any[]): Promise<any> {
    const url = this.proxyUrl || this.directUrl;
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: String(Date.now() + Math.random()),
      method,
      params,
    });

    console.log('[RPC]', method, '->', url.substring(0, 60));

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
      const msg = `RPC error: ${method} failed with HTTP ${response.status}: ${text.substring(0, 200)}`;
      console.error('[RPC]', msg);
      throw new Error(msg);
    }

    const json = await response.json();
    if (json.error) {
      const msg = `RPC error: ${method} → ${json.error.message || JSON.stringify(json.error)}`;
      console.error('[RPC]', msg);
      throw new Error(msg);
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
