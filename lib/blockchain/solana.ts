import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  TransactionSignature,
  ParsedTransactionWithMeta,
} from '@solana/web3.js';
import * as nacl from 'tweetnacl';
import { KeyDerivationManager } from '../crypto/keyDerivation';
import { SolanaConnectionService } from '@/services/solana/connectionService';

export interface SolanaWallet {
  publicKey: string;
  address: string;
}

export interface SolanaTransaction {
  signature: string;
  slot: number;
  timestamp: number | null;
  fee: number;
  status: 'success' | 'failed';
  type: 'send' | 'receive';
  amount: number;
  from: string;
  to: string;
}

export class SolanaBlockchain {
  private connection: Connection;
  private network: 'mainnet-beta' | 'devnet' | 'testnet';

  constructor(network: 'mainnet-beta' | 'devnet' | 'testnet' = 'mainnet-beta') {
    this.network = network;
    this.connection = SolanaConnectionService.getInstance().getConnection();
  }

  async getWallet(mnemonic: string, accountIndex: number = 0): Promise<SolanaWallet> {
    const keyPair = KeyDerivationManager.deriveSolanaKeyPair(mnemonic, accountIndex);
    const publicKey = new PublicKey(keyPair.publicKey);

    return {
      publicKey: publicKey.toBase58(),
      address: publicKey.toBase58(),
    };
  }

  private getKeypairFromMnemonic(mnemonic: string, accountIndex: number = 0): Keypair {
    const keyPair = KeyDerivationManager.deriveSolanaKeyPair(mnemonic, accountIndex);
    return Keypair.fromSecretKey(keyPair.secretKey);
  }

  async getBalance(address: string): Promise<number> {
    try {
      const publicKey = new PublicKey(address);
      const balance = await this.connection.getBalance(publicKey);
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      console.error('Error fetching Solana balance:', error);
      throw new Error('Failed to fetch balance');
    }
  }

  async sendTransaction(
    mnemonic: string,
    toAddress: string,
    amount: number,
    accountIndex: number = 0
  ): Promise<TransactionSignature> {
    try {
      const fromKeypair = this.getKeypairFromMnemonic(mnemonic, accountIndex);
      const toPublicKey = new PublicKey(toAddress);

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: fromKeypair.publicKey,
          toPubkey: toPublicKey,
          lamports: Math.floor(amount * LAMPORTS_PER_SOL),
        })
      );

      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [fromKeypair],
        {
          commitment: 'confirmed',
          preflightCommitment: 'confirmed',
        }
      );

      return signature;
    } catch (error: any) {
      console.error('Error sending Solana transaction:', error);
      throw new Error(error.message || 'Failed to send transaction');
    }
  }

  async estimateFee(toAddress: string, amount: number): Promise<number> {
    try {
      const recentBlockhash = await this.connection.getLatestBlockhash();
      const testPublicKey = Keypair.generate().publicKey;
      const toPublicKey = new PublicKey(toAddress);

      const transaction = new Transaction({
        recentBlockhash: recentBlockhash.blockhash,
        feePayer: testPublicKey,
      }).add(
        SystemProgram.transfer({
          fromPubkey: testPublicKey,
          toPubkey: toPublicKey,
          lamports: Math.floor(amount * LAMPORTS_PER_SOL),
        })
      );

      const fee = await this.connection.getFeeForMessage(
        transaction.compileMessage(),
        'confirmed'
      );

      return (fee.value || 5000) / LAMPORTS_PER_SOL;
    } catch (error) {
      console.error('Error estimating fee:', error);
      return 0.000005;
    }
  }

  async getTransactionHistory(
    address: string,
    limit: number = 20
  ): Promise<SolanaTransaction[]> {
    try {
      const publicKey = new PublicKey(address);
      const signatures = await this.connection.getSignaturesForAddress(publicKey, {
        limit,
      });

      const transactions: SolanaTransaction[] = [];

      for (const sig of signatures) {
        try {
          const tx = await this.connection.getParsedTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0,
          });

          if (tx && tx.meta) {
            const type = this.determineTransactionType(tx, address);
            const amount = this.extractTransactionAmount(tx, address);

            transactions.push({
              signature: sig.signature,
              slot: sig.slot,
              timestamp: sig.blockTime ?? null,
              fee: (tx.meta.fee || 0) / LAMPORTS_PER_SOL,
              status: tx.meta.err ? 'failed' : 'success',
              type,
              amount,
              from: this.extractFromAddress(tx),
              to: this.extractToAddress(tx),
            });
          }
        } catch (error) {
          console.error('Error parsing transaction:', error);
        }
      }

      return transactions;
    } catch (error) {
      console.error('Error fetching transaction history:', error);
      return [];
    }
  }

  private determineTransactionType(
    tx: ParsedTransactionWithMeta,
    userAddress: string
  ): 'send' | 'receive' {
    const preBalance = tx.meta?.preBalances[0] || 0;
    const postBalance = tx.meta?.postBalances[0] || 0;
    return postBalance > preBalance ? 'receive' : 'send';
  }

  private extractTransactionAmount(
    tx: ParsedTransactionWithMeta,
    userAddress: string
  ): number {
    const preBalance = tx.meta?.preBalances[0] || 0;
    const postBalance = tx.meta?.postBalances[0] || 0;
    return Math.abs(postBalance - preBalance) / LAMPORTS_PER_SOL;
  }

  private extractFromAddress(tx: ParsedTransactionWithMeta): string {
    return tx.transaction.message.accountKeys[0]?.pubkey.toBase58() || '';
  }

  private extractToAddress(tx: ParsedTransactionWithMeta): string {
    const accountKeys = tx.transaction.message.accountKeys;
    return accountKeys[1]?.pubkey.toBase58() || '';
  }

  async validateAddress(address: string): Promise<boolean> {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  async getAccountInfo(address: string) {
    try {
      const publicKey = new PublicKey(address);
      return await this.connection.getAccountInfo(publicKey);
    } catch (error) {
      console.error('Error fetching account info:', error);
      return null;
    }
  }

  async isAccountActive(address: string): Promise<boolean> {
    const accountInfo = await this.getAccountInfo(address);
    return accountInfo !== null;
  }

  getExplorerUrl(signature: string): string {
    const baseUrl =
      this.network === 'mainnet-beta'
        ? 'https://solscan.io'
        : `https://solscan.io?cluster=${this.network}`;
    return `${baseUrl}/tx/${signature}`;
  }

  getAddressExplorerUrl(address: string): string {
    const baseUrl =
      this.network === 'mainnet-beta'
        ? 'https://solscan.io'
        : `https://solscan.io?cluster=${this.network}`;
    return `${baseUrl}/account/${address}`;
  }
}
