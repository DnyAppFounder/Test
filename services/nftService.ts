import Constants from 'expo-constants';

export interface NFT {
  id: string;
  collection_id: string;
  token_id: string;
  name: string;
  description?: string;
  image_url: string;
  owner_address: string;
  metadata?: any;
  rarity_rank?: number;
  last_sale_price?: number;
  created_at: string;
}

export interface NFTCollection {
  id: string;
  contract_address: string;
  name: string;
  symbol?: string;
  description?: string;
  image_url?: string;
  floor_price?: number;
  total_supply?: number;
  is_verified: boolean;
  blockchain_id: string;
}

function getNftRpcUrl(): string {
  const supabaseUrl = Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  if (supabaseUrl) {
    return `${supabaseUrl}/functions/v1/solana-rpc`;
  }
  const directUrl = process.env.EXPO_PUBLIC_SOLANA_RPC_URL || '';
  if (directUrl) {
    return directUrl;
  }
  console.error('[NFTService] RPC error: No RPC URL configured. Set EXPO_PUBLIC_SOLANA_RPC_URL or EXPO_PUBLIC_SUPABASE_URL.');
  throw new Error('RPC error: No Solana RPC URL configured. Set EXPO_PUBLIC_SOLANA_RPC_URL.');
}

function sanitizeImageUrl(url?: string): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('ipfs://')) {
    return 'https://ipfs.io/ipfs/' + url.slice(7);
  }
  return null;
}

export class NFTService {
  static async getUserNFTs(walletAddress: string): Promise<NFT[]> {
    if (!walletAddress) return [];

    try {
      const response = await fetch(getNftRpcUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'get-assets',
          method: 'getAssetsByOwner',
          params: {
            ownerAddress: walletAddress,
            page: 1,
            limit: 50,
            displayOptions: {
              showFungible: false,
              showNativeBalance: false,
            },
          },
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        console.error(`[NFTService] RPC error: getAssetsByOwner failed HTTP ${response.status}: ${text.substring(0, 200)}`);
        return [];
      }

      const json = await response.json();
      const items: any[] = json?.result?.items ?? [];

      const nfts: NFT[] = [];
      for (const asset of items) {
        try {
          const content = asset?.content ?? {};
          const metadata = content?.metadata ?? {};
          const files: any[] = content?.files ?? [];
          const links = content?.links ?? {};

          let imageUrl =
            sanitizeImageUrl(links?.image) ??
            sanitizeImageUrl(files.find((f: any) => f?.mime?.startsWith('image/'))?.uri) ??
            sanitizeImageUrl(files[0]?.uri) ??
            sanitizeImageUrl(metadata?.image) ??
            null;

          if (!imageUrl) continue;

          const name = metadata?.name || asset?.id?.slice(0, 8) || 'Unknown NFT';
          const description = metadata?.description ?? undefined;
          const collectionName = asset?.grouping?.find((g: any) => g?.group_key === 'collection')?.group_value ?? asset?.id?.slice(0, 8) ?? 'unknown';

          nfts.push({
            id: asset.id,
            collection_id: collectionName,
            token_id: asset.id,
            name,
            description,
            image_url: imageUrl,
            owner_address: walletAddress,
            metadata: metadata?.attributes ? { attributes: metadata.attributes } : undefined,
            created_at: new Date().toISOString(),
          });
        } catch {
          // skip malformed assets
        }
      }

      return nfts;
    } catch (error) {
      console.error('[NFTService] RPC error: Failed to fetch NFTs:', error);
      return [];
    }
  }

  static async getNFTCollections(): Promise<NFTCollection[]> {
    return [];
  }

  static async getNFTById(nftId: string): Promise<NFT | null> {
    try {
      const response = await fetch(getNftRpcUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'get-asset',
          method: 'getAsset',
          params: { id: nftId },
        }),
      });

      if (!response.ok) return null;
      const json = await response.json();
      const asset = json?.result;
      if (!asset) return null;

      const content = asset?.content ?? {};
      const metadata = content?.metadata ?? {};
      const files: any[] = content?.files ?? [];
      const links = content?.links ?? {};

      const imageUrl =
        sanitizeImageUrl(links?.image) ??
        sanitizeImageUrl(files.find((f: any) => f?.mime?.startsWith('image/'))?.uri) ??
        sanitizeImageUrl(files[0]?.uri) ??
        sanitizeImageUrl(metadata?.image) ??
        '';

      return {
        id: asset.id,
        collection_id: asset?.grouping?.find((g: any) => g?.group_key === 'collection')?.group_value ?? asset.id,
        token_id: asset.id,
        name: metadata?.name || asset.id,
        description: metadata?.description,
        image_url: imageUrl,
        owner_address: '',
        metadata: metadata?.attributes ? { attributes: metadata.attributes } : undefined,
        created_at: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  static async getCollectionStats(_collectionId: string) {
    return {
      floor_price: 0,
      volume_24h: 0,
      volume_7d: 0,
      total_supply: 0,
      holders: 0,
      listed: 0,
    };
  }

  static formatPrice(price: number): string {
    return `${price.toFixed(2)} SOL`;
  }

  static formatUSD(solPrice: number, solToUsd = 150): string {
    return `$${(solPrice * solToUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}
