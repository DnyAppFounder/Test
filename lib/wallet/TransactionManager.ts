import { SolanaBlockchain } from '../blockchain/solana';
import { EVMBlockchain } from '../blockchain/evm';
import { SecureWalletManager } from './SecureWalletManager';

export interface TransactionRequest {
  blockchain: 'solana' | 'ethereum' | 'polygon' | 'base';
  to: string;
  amount: string;
  accountIndex: number;
}

export interface TransactionResult {
  success: boolean;
  hash?: string;
  error?: string;
}

export interface TransactionEstimate {
  fee: string;
  total: string;
}

export class TransactionManager {
  private static instance: TransactionManager;
  private walletManager: SecureWalletManager;

  private constructor() {
    this.walletManager = SecureWalletManager.getInstance();
  }

  static getInstance(): TransactionManager {
    if (!TransactionManager.instance) {
      TransactionManager.instance = new TransactionManager();
    }
    return TransactionManager.instance;
  }

  async sendTransaction(request: TransactionRequest): Promise<TransactionResult> {
    try {
      if (!this.walletManager.isUnlocked()) {
        throw new Error('Wallet is locked. Please unlock first.');
      }

      const mnemonic = this.walletManager.getMnemonic();

      if (request.blockchain === 'solana') {
        return await this.sendSolanaTransaction(
          mnemonic,
          request.to,
          request.amount,
          request.accountIndex
        );
      } else {
        return await this.sendEVMTransaction(
          mnemonic,
          request.blockchain,
          request.to,
          request.amount,
          request.accountIndex
        );
      }
    } catch (error: any) {
      console.error('Error sending transaction:', error);
      return {
        success: false,
        error: error.message || 'Failed to send transaction',
      };
    }
  }

  private async sendSolanaTransaction(
    mnemonic: string,
    to: string,
    amount: string,
    accountIndex: number
  ): Promise<TransactionResult> {
    try {
      const solana = new SolanaBlockchain('mainnet-beta');

      const isValidAddress = await solana.validateAddress(to);
      if (!isValidAddress) {
        throw new Error('Invalid Solana address');
      }

      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        throw new Error('Invalid amount');
      }

      const signature = await solana.sendTransaction(mnemonic, to, amountNum, accountIndex);

      return {
        success: true,
        hash: signature,
      };
    } catch (error: any) {
      throw new Error(error.message || 'Solana transaction failed');
    }
  }

  private async sendEVMTransaction(
    mnemonic: string,
    blockchain: 'ethereum' | 'polygon' | 'base',
    to: string,
    amount: string,
    accountIndex: number
  ): Promise<TransactionResult> {
    try {
      const evm = new EVMBlockchain(blockchain);

      const isValidAddress = await evm.validateAddress(to);
      if (!isValidAddress) {
        throw new Error(`Invalid ${blockchain} address`);
      }

      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        throw new Error('Invalid amount');
      }

      const hash = await evm.sendTransaction(mnemonic, to, amount, accountIndex);

      return {
        success: true,
        hash,
      };
    } catch (error: any) {
      throw new Error(error.message || `${blockchain} transaction failed`);
    }
  }

  async estimateTransactionFee(request: TransactionRequest): Promise<TransactionEstimate> {
    try {
      let fee: string;

      if (request.blockchain === 'solana') {
        const solana = new SolanaBlockchain('mainnet-beta');
        fee = (await solana.estimateFee(request.to, parseFloat(request.amount))).toString();
      } else {
        const evm = new EVMBlockchain(request.blockchain);
        fee = await evm.estimateFee(request.to, request.amount);
      }

      const total = (parseFloat(request.amount) + parseFloat(fee)).toFixed(9);

      return { fee, total };
    } catch (error) {
      console.error('Error estimating fee:', error);
      return { fee: '0', total: request.amount };
    }
  }

  async validateAddress(blockchain: string, address: string): Promise<boolean> {
    try {
      if (blockchain === 'solana') {
        const solana = new SolanaBlockchain('mainnet-beta');
        return await solana.validateAddress(address);
      } else {
        const evm = new EVMBlockchain(blockchain as any);
        return await evm.validateAddress(address);
      }
    } catch (error) {
      return false;
    }
  }

  getExplorerUrl(blockchain: string, hash: string): string {
    if (blockchain === 'solana') {
      const solana = new SolanaBlockchain('mainnet-beta');
      return solana.getExplorerUrl(hash);
    } else {
      const evm = new EVMBlockchain(blockchain as any);
      return evm.getExplorerUrl(hash);
    }
  }
}
