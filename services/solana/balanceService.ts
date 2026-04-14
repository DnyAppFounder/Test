import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { SolanaConnectionService } from './connectionService';

export interface TokenBalance {
  mint: string;
  balance: number;
  decimals: number;
  uiAmount: number;
}

export interface WalletBalances {
  solBalance: number;
  tokens: TokenBalance[];
}

export class SolanaBalanceService {
  private connectionService: SolanaConnectionService;

  constructor() {
    this.connectionService = SolanaConnectionService.getInstance();
  }

  async getSOLBalance(address: string): Promise<number> {
    try {
      const publicKey = new PublicKey(address);
      const balance = await this.connectionService.getConnection().getBalance(publicKey);
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      console.error('Error fetching SOL balance:', error);
      return 0;
    }
  }

  async getTokenAccounts(address: string): Promise<TokenBalance[]> {
    try {
      const publicKey = new PublicKey(address);
      const connection = this.connectionService.getConnection();

      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      });

      const tokens: TokenBalance[] = [];

      for (const accountInfo of tokenAccounts.value) {
        const parsedInfo = accountInfo.account.data.parsed.info;
        const tokenAmount = parsedInfo.tokenAmount;

        if (tokenAmount.uiAmount > 0) {
          tokens.push({
            mint: parsedInfo.mint,
            balance: parseInt(tokenAmount.amount),
            decimals: tokenAmount.decimals,
            uiAmount: tokenAmount.uiAmount,
          });
        }
      }

      return tokens;
    } catch (error) {
      console.error('Error fetching token accounts:', error);
      return [];
    }
  }

  async getWalletBalances(address: string): Promise<WalletBalances> {
    const [solBalance, tokens] = await Promise.all([
      this.getSOLBalance(address),
      this.getTokenAccounts(address),
    ]);

    return {
      solBalance,
      tokens,
    };
  }
}
