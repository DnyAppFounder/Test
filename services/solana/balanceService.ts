import { LAMPORTS_PER_SOL } from '@solana/web3.js';
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

const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 1500): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      if (i === retries) throw error;
      await new Promise(r => setTimeout(r, delayMs * (i + 1)));
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

    try {
      const result = await withRetry(() =>
        this.connectionService.rpcCall('getBalance', [address, { commitment: 'confirmed' }])
      );

      const lamports = typeof result === 'object' ? result.value : result;
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

    try {
      const result = await withRetry(() =>
        this.connectionService.rpcCall('getTokenAccountsByOwner', [
          address,
          { programId: TOKEN_PROGRAM_ID },
          { encoding: 'jsonParsed', commitment: 'confirmed' },
        ])
      );

      const accounts = result?.value ?? [];
      console.log('[BalanceService] Raw token accounts found:', accounts.length);

      const tokens: TokenBalance[] = [];

      for (const account of accounts) {
        try {
          const parsedInfo = account.account.data.parsed.info;
          const tokenAmount = parsedInfo.tokenAmount;
          const uiAmount = tokenAmount.uiAmount;

          // Filter NFTs: decimals === 0 with exactly 1 token = NFT
          const isNFT = tokenAmount.decimals === 0 && uiAmount === 1;
          if (uiAmount && uiAmount > 0 && !isNFT) {
            tokens.push({
              mint: parsedInfo.mint,
              balance: parseInt(tokenAmount.amount),
              decimals: tokenAmount.decimals,
              uiAmount,
            });
          }
        } catch {
          // skip malformed
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
