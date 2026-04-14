import { Connection, Cluster, clusterApiUrl } from '@solana/web3.js';

export class SolanaConnectionService {
  private static instance: SolanaConnectionService;
  private connection: Connection;
  private cluster: Cluster;

  private constructor(cluster: Cluster = 'mainnet-beta') {
    this.cluster = cluster;
    this.connection = new Connection(clusterApiUrl(cluster), 'confirmed');
  }

  static getInstance(cluster: Cluster = 'mainnet-beta'): SolanaConnectionService {
    if (!SolanaConnectionService.instance) {
      SolanaConnectionService.instance = new SolanaConnectionService(cluster);
    }
    return SolanaConnectionService.instance;
  }

  getConnection(): Connection {
    return this.connection;
  }

  getCluster(): Cluster {
    return this.cluster;
  }

  switchCluster(cluster: Cluster) {
    this.cluster = cluster;
    this.connection = new Connection(clusterApiUrl(cluster), 'confirmed');
  }

  async getBlockHeight(): Promise<number> {
    return await this.connection.getBlockHeight();
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
