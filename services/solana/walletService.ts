import { SolanaBalanceService, WalletBalances } from './balanceService';
import { TokenMetadataService, TokenMetadata } from './tokenMetadataService';
import { SolanaPriceService, TokenPrice } from './priceService';

export interface EnrichedToken {
  mint: string;
  tokenAccountAddress: string;
  balance: number;
  uiAmount: number;
  decimals: number;
  metadata: TokenMetadata;
  price: TokenPrice | null;
  totalValue: number;
}

export interface WalletPortfolio {
  address: string;
  solBalance: number;
  solPrice: number;
  solValue: number;
  tokens: EnrichedToken[];
  totalValue: number;
}

export class SolanaWalletService {
  private balanceService: SolanaBalanceService;
  private metadataService: TokenMetadataService;
  private priceService: SolanaPriceService;

  constructor() {
    this.balanceService = new SolanaBalanceService();
    this.metadataService = new TokenMetadataService();
    this.priceService = new SolanaPriceService();
  }

  async getWalletPortfolio(address: string): Promise<WalletPortfolio> {
    console.log('[WalletService] Loading portfolio for:', address);
    const balances = await this.balanceService.getWalletBalances(address);
    console.log('[WalletService] SOL balance:', balances.solBalance, '| SPL token accounts:', balances.tokens.length);
    const solPrice = await this.priceService.getSOLPrice();
    console.log('[WalletService] SOL price from Jupiter:', solPrice);
    const solValue = balances.solBalance * solPrice;

    const enrichedTokens: EnrichedToken[] = [];

    if (balances.tokens.length > 0) {
      const mintAddresses = balances.tokens.map((t) => t.mint);
      const [metadataMap, pricesMap] = await Promise.all([
        this.metadataService.getBatchTokenMetadata(mintAddresses),
        this.priceService.getBatchPrices(mintAddresses),
      ]);

      for (const token of balances.tokens) {
        const metadata = metadataMap.get(token.mint) || {
          mint: token.mint,
          name: 'Unknown',
          symbol: 'UNKNOWN',
          decimals: token.decimals,
          verified: false,
        };

        const price = pricesMap.get(token.mint) || null;
        const totalValue = price ? token.uiAmount * price.price : 0;

        enrichedTokens.push({
          ...token,
          metadata,
          price,
          totalValue,
        });
      }
    }

    enrichedTokens.sort((a, b) => b.totalValue - a.totalValue);

    const totalValue = solValue + enrichedTokens.reduce((sum, t) => sum + t.totalValue, 0);

    return {
      address,
      solBalance: balances.solBalance,
      solPrice,
      solValue,
      tokens: enrichedTokens,
      totalValue,
    };
  }

  async getSOLBalance(address: string): Promise<number> {
    return await this.balanceService.getSOLBalance(address);
  }

  async refreshCache() {
    this.metadataService.clearCache();
    this.priceService.clearCache();
  }
}
