import { Connection } from '@solana/web3.js';

function getSupabaseRpcProxyUrl(): string {
  const supabaseUrl = typeof process !== 'undefined'
    ? process.env?.EXPO_PUBLIC_SUPABASE_URL
    : undefined;
  if (supabaseUrl) {
    return `${supabaseUrl}/functions/v1/solana-rpc`;
  }
  return '';
}

function getDirectRpcUrl(): string {
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SOLANA_RPC_URL) {
    return process.env.EXPO_PUBLIC_SOLANA_RPC_URL;
  }
  return 'https://api.mainnet-beta.solana.com';
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
    this.connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 30000,
    });
    console.log('[ConnectionService] Proxy URL:', this.proxyUrl || 'none');
    console.log('[ConnectionService] Direct URL:', this.directUrl);
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

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`RPC ${response.status}: ${text.substring(0, 200)}`);
    }

    const json = await response.json();
    if (json.error) {
      throw new Error(`RPC error: ${json.error.message || JSON.stringify(json.error)}`);
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
