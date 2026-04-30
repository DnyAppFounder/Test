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

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 1000): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const isRateLimit = error?.message?.includes('429') || error?.status === 429;
      if (i === retries) throw error;
      const wait = isRateLimit ? delayMs * (i + 2) : delayMs;
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw new Error('withRetry exhausted');
}

export class SolanaBalanceService {
  private connectionService: SolanaConnectionService;

  constructor() {
    this.connectionService = SolanaConnectionService.getInstance();
  }

  async getSOLBalance(address: string): Promise<number> {
    console.log('[BalanceService] Fetching SOL balance for:', address);
    const publicKey = new PublicKey(address);

    try {
      const lamports = await withRetry(() =>
        this.connectionService.getConnection().getBalance(publicKey)
      );
      const solBalance = lamports / LAMPORTS_PER_SOL;
      console.log('[BalanceService] SOL lamports:', lamports, '| SOL balance:', solBalance);
      return solBalance;
    } catch (error) {
      console.error('[BalanceService] Error fetching SOL balance:', error);
      throw error;
    }
  }

  async getTokenAccounts(address: string): Promise<TokenBalance[]> {
    console.log('[BalanceService] Fetching SPL token accounts for:', address);
    const publicKey = new PublicKey(address);
    const connection = this.connectionService.getConnection();

    try {
      const tokenAccounts = await withRetry(() =>
        connection.getParsedTokenAccountsByOwner(publicKey, {
          programId: TOKEN_PROGRAM_ID,
        })
      );

      console.log('[BalanceService] Raw token accounts found:', tokenAccounts.value.length);

      const tokens: TokenBalance[] = [];

      for (const accountInfo of tokenAccounts.value) {
        try {
          const parsedInfo = accountInfo.account.data.parsed.info;
          const tokenAmount = parsedInfo.tokenAmount;

          if (tokenAmount.uiAmount && tokenAmount.uiAmount > 0) {
            tokens.push({
              mint: parsedInfo.mint,
              balance: parseInt(tokenAmount.amount),
              decimals: tokenAmount.decimals,
              uiAmount: tokenAmount.uiAmount,
            });
          }
        } catch {
          // skip malformed account data
        }
      }

      console.log('[BalanceService] SPL tokens with balance > 0:', tokens.length);
      return tokens;
    } catch (error) {
      console.error('[BalanceService] Error fetching token accounts:', error);
      throw error;
    }
  }

  async getWalletBalances(address: string): Promise<WalletBalances> {
    const [solBalance, tokens] = await Promise.all([
      this.getSOLBalance(address),
      this.getTokenAccounts(address),
    ]);

    return { solBalance, tokens };
  }
}
