import { Connection } from '@solana/web3.js';

function getRpcUrl(): string {
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SOLANA_RPC_URL) {
    return process.env.EXPO_PUBLIC_SOLANA_RPC_URL;
  }

  const supabaseUrl = typeof process !== 'undefined'
    ? process.env?.EXPO_PUBLIC_SUPABASE_URL
    : undefined;

  if (supabaseUrl) {
    return `${supabaseUrl}/functions/v1/solana-rpc`;
  }

  return 'https://api.mainnet-beta.solana.com';
}

export class SolanaConnectionService {
  private static instance: SolanaConnectionService;
  private connection: Connection;
  private rpcUrl: string;

  private constructor() {
    this.rpcUrl = getRpcUrl();
    this.connection = new Connection(this.rpcUrl, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 30000,
    });
    console.log('[ConnectionService] Using RPC:', this.rpcUrl);
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
    return this.rpcUrl;
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.connection.getBlockHeight();
      return true;
    } catch {
      return false;
    }
  }
}
