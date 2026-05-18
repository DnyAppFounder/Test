import { SolanaWalletService } from './solana/walletService';
import { jupiterTokenListService } from './jupiter/tokenListService';
import { tokenRegistryService } from './tokenRegistryService';
import { tokenMetadataService } from './solana/tokenMetadataService';

export interface WalletAsset {
  id: string;
  blockchain: string;
  address: string;
  tokenAccountAddress?: string;
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

  async loadSolanaWalletAssets(
    address: string,
    onLogosResolved?: (assets: WalletAsset[]) => void,
  ): Promise<WalletAssetsResponse> {
    if (!address) {
      return { assets: [], totalValue: 0, nativeBalance: 0, nativeValue: 0, loading: false };
    }

    console.log('[AssetLoader] Loading assets for wallet:', address);

    try {
      const portfolio = await this.solanaService.getWalletPortfolio(address);
      console.log('[AssetLoader] Portfolio loaded — SOL:', portfolio.solBalance, '| Tokens:', portfolio.tokens.length, '| Total USD:', portfolio.totalValue);

      const nativeAsset: WalletAsset = {
        id: 'solana-native',
        blockchain: 'solana',
        address: 'So11111111111111111111111111111111111111112',
        name: 'Solana',
        symbol: 'SOL',
        decimals: 9,
        balance: portfolio.solBalance.toString(),
        uiBalance: portfolio.solBalance,
        price: portfolio.solPrice || 0,
        value: portfolio.solValue,
        priceChange24h: 0,
        logoUrl: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
        isNative: true,
        verified: true,
      };

      const tokenAssets: WalletAsset[] = portfolio.tokens.map((token) => {
        let logoUrl = token.metadata.logoURI || undefined;
        if (!logoUrl && token.metadata.verified) {
          logoUrl = `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${token.mint}/logo.png`;
        }

        return {
          id: token.mint,
          blockchain: 'solana',
          address: token.mint,
          tokenAccountAddress: token.tokenAccountAddress || undefined,
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
        };
      });

      // Always include native SOL even if balance is 0; filter out zero-balance SPL tokens
      const allAssets = [nativeAsset, ...tokenAssets.filter((asset) => asset.uiBalance > 0)];
      allAssets.sort((a, b) => b.value - a.value);

      // Resolve missing logos in background (don't block display)
      this.resolveLogosInBackground(tokenAssets, allAssets, onLogosResolved);

      // Register all wallet-owned mints into the global token registry so they
      // become searchable and show proper metadata instead of "Token not found"
      const walletMints = tokenAssets.map(a => a.address).filter(Boolean);
      if (walletMints.length > 0) {
        tokenRegistryService.registerWalletMints(walletMints).catch(() => {});
      }

      return {
        assets: allAssets,
        totalValue: portfolio.totalValue,
        nativeBalance: portfolio.solBalance,
        nativeValue: portfolio.solValue,
        loading: false,
      };
    } catch (error: any) {
      console.error('[AssetLoader] Error loading Solana wallet assets:', error);
      return {
        assets: [],
        totalValue: 0,
        nativeBalance: 0,
        nativeValue: 0,
        loading: false,
        error: error?.message || 'Failed to load wallet assets from RPC',
      };
    }
  }

  private async resolveLogosInBackground(
    assets: WalletAsset[],
    allAssets: WalletAsset[],
    onResolved?: (updated: WalletAsset[]) => void,
  ) {
    const missing = assets.filter(a => !a.logoUrl);
    if (missing.length === 0) return;

    let anyResolved = false;

    // Batch-resolve via tokenMetadataService (covers DAS, pump.fun, Jupiter, launchpad)
    try {
      const mints = missing.map(a => a.address);
      const metaMap = await tokenMetadataService.getBatchTokenMetadata(mints);
      for (const asset of missing) {
        const meta = metaMap.get(asset.address);
        // Only update when the new value is a real non-empty URL; never overwrite valid with null
        if (meta?.logoURI && !asset.logoUrl) {
          asset.logoUrl = meta.logoURI;
          anyResolved = true;
        }
      }
    } catch {}

    // Secondary fallback: Jupiter token list for any still-missing
    for (const asset of assets) {
      if (asset.logoUrl) continue;
      try {
        const jupToken = await jupiterTokenListService.getTokenByAddress(asset.address);
        if (jupToken?.logoURI) {
          asset.logoUrl = jupToken.logoURI;
          anyResolved = true;
        }
      } catch {}
    }

    // Notify the UI so it re-renders with the resolved logos.
    // Spread creates a new array reference so React detects the change.
    if (anyResolved && onResolved) {
      onResolved([...allAssets]);
    }
  }

  async loadWalletAssets(
    blockchain: string,
    address: string,
    onLogosResolved?: (assets: WalletAsset[]) => void,
  ): Promise<WalletAssetsResponse> {
    if (blockchain === 'solana') {
      return this.loadSolanaWalletAssets(address, onLogosResolved);
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

  async refreshWalletAssets(
    blockchain: string,
    address: string,
    onLogosResolved?: (assets: WalletAsset[]) => void,
  ): Promise<WalletAssetsResponse> {
    this.solanaService.refreshCache();
    jupiterTokenListService.clearCache();
    return this.loadWalletAssets(blockchain, address, onLogosResolved);
  }
}

export const walletAssetLoader = new WalletAssetLoaderService();
