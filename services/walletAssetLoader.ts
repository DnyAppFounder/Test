import { SolanaWalletService, EnrichedToken } from './solana/walletService';
import { jupiterTokenListService } from './jupiter/tokenListService';
import { dexScreenerService } from './dexscreener/tokenDiscoveryService';

export interface WalletAsset {
  id: string;
  blockchain: string;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  balance: string;
  uiBalance: number;
  price: number;
  value: number;
  priceChange24h: number;
  logoUrl?: string;
  isNative: boolean;
  verified: boolean;
}

export interface WalletAssetsResponse {
  assets: WalletAsset[];
  totalValue: number;
  nativeBalance: number;
  nativeValue: number;
  loading: boolean;
  error?: string;
}

class WalletAssetLoaderService {
  private solanaService: SolanaWalletService;

  constructor() {
    this.solanaService = new SolanaWalletService();
  }

  async loadSolanaWalletAssets(address: string): Promise<WalletAssetsResponse> {
    try {
      console.log('[AssetLoader] Loading assets for wallet:', address);
      const portfolio = await this.solanaService.getWalletPortfolio(address);
      console.log('[AssetLoader] Portfolio loaded — SOL:', portfolio.solBalance, '| Tokens:', portfolio.tokens.length, '| Total USD:', portfolio.totalValue);

      const nativeAsset: WalletAsset = {
        id: 'solana',
        blockchain: 'solana',
        address: 'So11111111111111111111111111111111111111112',
        name: 'Solana',
        symbol: 'SOL',
        decimals: 9,
        balance: portfolio.solBalance.toString(),
        uiBalance: portfolio.solBalance,
        price: portfolio.solBalance > 0 ? portfolio.solValue / portfolio.solBalance : 0,
        value: portfolio.solValue,
        priceChange24h: 0,
        logoUrl: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
        isNative: true,
        verified: true,
      };

      const tokenAssets = await Promise.all(
        portfolio.tokens.map(async (token) => {
          let logoUrl = token.metadata.logoURI || undefined;

          if (!logoUrl && token.metadata.verified) {
            logoUrl = `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${token.mint}/logo.png`;
          }

          if (!logoUrl) {
            try {
              const jupiterToken = await jupiterTokenListService.getTokenByAddress(token.mint);
              logoUrl = jupiterToken?.logoURI;
            } catch {}
          }

          if (!logoUrl) {
            try {
              const dexPairs = await dexScreenerService.getTokenByAddress(token.mint);
              if (dexPairs.length > 0) {
                logoUrl = dexPairs[0].info?.imageUrl;
              }
            } catch {}
          }

          return {
            id: token.mint,
            blockchain: 'solana',
            address: token.mint,
            name: token.metadata.name,
            symbol: token.metadata.symbol,
            decimals: token.decimals,
            balance: token.balance.toString(),
            uiBalance: token.uiAmount,
            price: token.price?.price || 0,
            value: token.totalValue,
            priceChange24h: token.price?.priceChange24h || 0,
            logoUrl,
            isNative: false,
            verified: token.metadata.verified,
          } as WalletAsset;
        })
      );

      const allAssets = [nativeAsset, ...tokenAssets].filter((asset) => asset.uiBalance > 0);

      allAssets.sort((a, b) => b.value - a.value);

      return {
        assets: allAssets,
        totalValue: portfolio.totalValue,
        nativeBalance: portfolio.solBalance,
        nativeValue: portfolio.solValue,
        loading: false,
      };
    } catch (error) {
      console.error('Error loading Solana wallet assets:', error);
      return {
        assets: [],
        totalValue: 0,
        nativeBalance: 0,
        nativeValue: 0,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load wallet assets',
      };
    }
  }

  async loadWalletAssets(blockchain: string, address: string): Promise<WalletAssetsResponse> {
    if (blockchain === 'solana') {
      return this.loadSolanaWalletAssets(address);
    }

    return {
      assets: [],
      totalValue: 0,
      nativeBalance: 0,
      nativeValue: 0,
      loading: false,
      error: `Blockchain ${blockchain} not yet supported`,
    };
  }

  async refreshWalletAssets(blockchain: string, address: string): Promise<WalletAssetsResponse> {
    this.solanaService.refreshCache();
    dexScreenerService.clearCache();
    jupiterTokenListService.clearCache();

    return this.loadWalletAssets(blockchain, address);
  }
}

export const walletAssetLoader = new WalletAssetLoaderService();
