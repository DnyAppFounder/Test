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
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
// wSOL is excluded from SPL list — native SOL is fetched via getBalance()
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

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

function parseTokenAccounts(accounts: any[]): TokenBalance[] {
  const tokens: TokenBalance[] = [];

  for (const account of accounts) {
    try {
      const parsedInfo = account.account?.data?.parsed?.info;
      if (!parsedInfo) continue;

      const tokenAmount = parsedInfo.tokenAmount;
      if (!tokenAmount) continue;

      const decimals: number = tokenAmount.decimals ?? 0;
      const rawAmount: number = parseInt(tokenAmount.amount ?? '0', 10);
      // uiAmount can be null for some tokens — compute it from rawAmount + decimals
      const uiAmount: number = rawAmount > 0
        ? rawAmount / Math.pow(10, decimals)
        : (typeof tokenAmount.uiAmount === 'number' ? tokenAmount.uiAmount : 0);

      const mint: string = parsedInfo.mint;

      // Skip zero balance
      if (rawAmount <= 0 || uiAmount <= 0) continue;
      // Skip wSOL — native SOL is handled separately
      if (mint === WSOL_MINT) continue;
      // Skip NFTs: decimals === 0 AND exactly 1 token
      if (decimals === 0 && uiAmount === 1) continue;

      tokens.push({ mint, balance: rawAmount, decimals, uiAmount });
    } catch {
      // skip malformed account entries
    }
  }

  return tokens;
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

  /** Fetch SPL token accounts for one program ID */
  private async fetchTokenAccountsByProgram(address: string, programId: string): Promise<TokenBalance[]> {
    try {
      const result = await withRetry(() =>
        this.connectionService.rpcCall('getTokenAccountsByOwner', [
          address,
          { programId },
          { encoding: 'jsonParsed', commitment: 'confirmed' },
        ])
      );
      const accounts = result?.value ?? [];
      const tokens = parseTokenAccounts(accounts);
      console.log(`[BalanceService] ${programId === TOKEN_PROGRAM_ID ? 'SPL' : 'Token-2022'} accounts: ${accounts.length} raw → ${tokens.length} with balance`);
      return tokens;
    } catch (error) {
      console.error(`[BalanceService] Error fetching accounts for program ${programId}:`, error);
      return [];
    }
  }

  async getTokenAccounts(address: string): Promise<TokenBalance[]> {
    console.log('[BalanceService] Fetching all token accounts for:', address);

    // Fetch both Token program and Token-2022 in parallel
    const [splTokens, token2022Tokens] = await Promise.all([
      this.fetchTokenAccountsByProgram(address, TOKEN_PROGRAM_ID),
      this.fetchTokenAccountsByProgram(address, TOKEN_2022_PROGRAM_ID),
    ]);

    // Deduplicate by mint (prefer SPL entry if both exist, which shouldn't happen)
    const mintSeen = new Set<string>();
    const allTokens: TokenBalance[] = [];
    for (const t of [...splTokens, ...token2022Tokens]) {
      if (!mintSeen.has(t.mint)) {
        mintSeen.add(t.mint);
        allTokens.push(t);
      }
    }

    console.log('[BalanceService] Total unique tokens with balance:', allTokens.length);
    return allTokens;
  }

  async getWalletBalances(address: string): Promise<WalletBalances> {
    const [solBalance, tokens] = await Promise.all([
      this.getSOLBalance(address),
      this.getTokenAccounts(address),
    ]);
    return { solBalance, tokens };
  }
}
