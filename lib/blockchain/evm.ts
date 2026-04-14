import { ethers } from 'ethers';
import { KeyDerivationManager } from '../crypto/keyDerivation';

export interface EVMWallet {
  address: string;
  publicKey: string;
}

export interface EVMTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  timestamp: number;
  blockNumber: number;
  status: 'success' | 'failed' | 'pending';
  type: 'send' | 'receive';
  gasUsed?: string;
  gasPrice?: string;
  fee?: string;
}

export interface EVMChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  symbol: string;
  explorerUrl: string;
  decimals: number;
}

export const CHAIN_CONFIGS: Record<string, EVMChainConfig> = {
  ethereum: {
    chainId: 1,
    name: 'Ethereum Mainnet',
    rpcUrl: 'https://eth.llamarpc.com',
    symbol: 'ETH',
    explorerUrl: 'https://etherscan.io',
    decimals: 18,
  },
  polygon: {
    chainId: 137,
    name: 'Polygon Mainnet',
    rpcUrl: 'https://polygon-rpc.com',
    symbol: 'MATIC',
    explorerUrl: 'https://polygonscan.com',
    decimals: 18,
  },
  base: {
    chainId: 8453,
    name: 'Base Mainnet',
    rpcUrl: 'https://mainnet.base.org',
    symbol: 'ETH',
    explorerUrl: 'https://basescan.org',
    decimals: 18,
  },
  sepolia: {
    chainId: 11155111,
    name: 'Sepolia Testnet',
    rpcUrl: 'https://rpc.sepolia.org',
    symbol: 'ETH',
    explorerUrl: 'https://sepolia.etherscan.io',
    decimals: 18,
  },
};

export class EVMBlockchain {
  private provider: ethers.JsonRpcProvider;
  private config: EVMChainConfig;
  private chainName: string;

  constructor(chain: keyof typeof CHAIN_CONFIGS = 'ethereum') {
    this.chainName = chain;
    this.config = CHAIN_CONFIGS[chain];
    this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl, {
      chainId: this.config.chainId,
      name: this.config.name,
    });
  }

  async getWallet(mnemonic: string, accountIndex: number = 0): Promise<EVMWallet> {
    const hdNode = KeyDerivationManager.deriveEthereumHDNode(mnemonic, accountIndex);

    if (!hdNode.privateKey) {
      throw new Error('Failed to derive private key');
    }

    const wallet = new ethers.Wallet(ethers.hexlify(hdNode.privateKey));

    return {
      address: wallet.address,
      publicKey: ethers.hexlify(hdNode.publicKey),
    };
  }

  private async getWalletSigner(
    mnemonic: string,
    accountIndex: number = 0
  ): Promise<ethers.Wallet> {
    const hdNode = KeyDerivationManager.deriveEthereumHDNode(mnemonic, accountIndex);

    if (!hdNode.privateKey) {
      throw new Error('Failed to derive private key');
    }

    return new ethers.Wallet(ethers.hexlify(hdNode.privateKey), this.provider);
  }

  async getBalance(address: string): Promise<string> {
    try {
      const balance = await this.provider.getBalance(address);
      return ethers.formatEther(balance);
    } catch (error) {
      console.error(`Error fetching ${this.chainName} balance:`, error);
      throw new Error('Failed to fetch balance');
    }
  }

  async sendTransaction(
    mnemonic: string,
    toAddress: string,
    amount: string,
    accountIndex: number = 0
  ): Promise<string> {
    try {
      const wallet = await this.getWalletSigner(mnemonic, accountIndex);

      const tx = await wallet.sendTransaction({
        to: toAddress,
        value: ethers.parseEther(amount),
      });

      const receipt = await tx.wait();

      if (!receipt) {
        throw new Error('Transaction failed - no receipt');
      }

      return receipt.hash;
    } catch (error: any) {
      console.error(`Error sending ${this.chainName} transaction:`, error);
      throw new Error(error.message || 'Failed to send transaction');
    }
  }

  async estimateFee(toAddress: string, amount: string): Promise<string> {
    try {
      const feeData = await this.provider.getFeeData();
      const gasLimit = await this.provider.estimateGas({
        to: toAddress,
        value: ethers.parseEther(amount),
      });

      const gasPrice = feeData.gasPrice || ethers.parseUnits('20', 'gwei');
      const estimatedFee = gasLimit * gasPrice;

      return ethers.formatEther(estimatedFee);
    } catch (error) {
      console.error('Error estimating fee:', error);
      return '0.001';
    }
  }

  async getTransactionHistory(
    address: string,
    limit: number = 20
  ): Promise<EVMTransaction[]> {
    try {
      const currentBlock = await this.provider.getBlockNumber();
      const startBlock = Math.max(0, currentBlock - 10000);

      const transactions: EVMTransaction[] = [];

      for (let i = currentBlock; i >= startBlock && transactions.length < limit; i--) {
        try {
          const block = await this.provider.getBlock(i, true);

          if (block && block.transactions) {
            for (const txHash of block.transactions) {
              if (transactions.length >= limit) break;

              if (typeof txHash === 'string') {
                const tx = await this.provider.getTransaction(txHash);
                const receipt = await this.provider.getTransactionReceipt(txHash);

                if (
                  tx &&
                  (tx.from.toLowerCase() === address.toLowerCase() ||
                    tx.to?.toLowerCase() === address.toLowerCase())
                ) {
                  const type =
                    tx.from.toLowerCase() === address.toLowerCase() ? 'send' : 'receive';

                  const fee = receipt
                    ? ethers.formatEther(receipt.gasUsed * (receipt.gasPrice || 0n))
                    : undefined;

                  transactions.push({
                    hash: tx.hash,
                    from: tx.from,
                    to: tx.to || '',
                    value: ethers.formatEther(tx.value),
                    timestamp: block.timestamp,
                    blockNumber: block.number,
                    status: receipt?.status === 1 ? 'success' : 'failed',
                    type,
                    gasUsed: receipt?.gasUsed.toString(),
                    gasPrice: receipt?.gasPrice?.toString(),
                    fee,
                  });
                }
              }
            }
          }
        } catch (error) {
          console.error('Error fetching block:', error);
        }
      }

      return transactions;
    } catch (error) {
      console.error('Error fetching transaction history:', error);
      return [];
    }
  }

  async getTransaction(hash: string): Promise<EVMTransaction | null> {
    try {
      const tx = await this.provider.getTransaction(hash);
      const receipt = await this.provider.getTransactionReceipt(hash);

      if (!tx) return null;

      const block = await this.provider.getBlock(tx.blockNumber || 0);
      const timestamp = block?.timestamp || Date.now() / 1000;

      const fee = receipt
        ? ethers.formatEther(receipt.gasUsed * (receipt.gasPrice || 0n))
        : undefined;

      return {
        hash: tx.hash,
        from: tx.from,
        to: tx.to || '',
        value: ethers.formatEther(tx.value),
        timestamp,
        blockNumber: tx.blockNumber || 0,
        status: receipt ? (receipt.status === 1 ? 'success' : 'failed') : 'pending',
        type: 'send',
        gasUsed: receipt?.gasUsed.toString(),
        gasPrice: receipt?.gasPrice?.toString(),
        fee,
      };
    } catch (error) {
      console.error('Error fetching transaction:', error);
      return null;
    }
  }

  async validateAddress(address: string): Promise<boolean> {
    try {
      return ethers.isAddress(address);
    } catch {
      return false;
    }
  }

  async getGasPrice(): Promise<string> {
    try {
      const feeData = await this.provider.getFeeData();
      return ethers.formatUnits(feeData.gasPrice || 0n, 'gwei');
    } catch (error) {
      console.error('Error fetching gas price:', error);
      return '0';
    }
  }

  async getNonce(address: string): Promise<number> {
    try {
      return await this.provider.getTransactionCount(address);
    } catch (error) {
      console.error('Error fetching nonce:', error);
      return 0;
    }
  }

  getExplorerUrl(hash: string): string {
    return `${this.config.explorerUrl}/tx/${hash}`;
  }

  getAddressExplorerUrl(address: string): string {
    return `${this.config.explorerUrl}/address/${address}`;
  }

  getChainId(): number {
    return this.config.chainId;
  }

  getChainName(): string {
    return this.config.name;
  }

  getSymbol(): string {
    return this.config.symbol;
  }
}
