import { PublicKey } from '@solana/web3.js';
import { SolanaConnectionService } from './connectionService';

export interface TokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  logoURI?: string;
  decimals: number;
  verified: boolean;
}

const WELL_KNOWN_TOKENS: Record<string, TokenMetadata> = {
  'So11111111111111111111111111111111111111112': {
    mint: 'So11111111111111111111111111111111111111112',
    name: 'Wrapped SOL',
    symbol: 'SOL',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    decimals: 9,
    verified: true,
  },
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': {
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    name: 'USD Coin',
    symbol: 'USDC',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
    decimals: 6,
    verified: true,
  },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': {
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    name: 'USDT',
    symbol: 'USDT',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png',
    decimals: 6,
    verified: true,
  },
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': {
    mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
    name: 'Marinade staked SOL',
    symbol: 'mSOL',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png',
    decimals: 9,
    verified: true,
  },
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs': {
    mint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
    name: 'Ether',
    symbol: 'ETH',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs/logo.png',
    decimals: 8,
    verified: true,
  },
  'So11111111111111111111111111111111111111111': {
    mint: 'So11111111111111111111111111111111111111111',
    name: 'Solana',
    symbol: 'SOL',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    decimals: 9,
    verified: true,
  },
};

export class TokenMetadataService {
  private connectionService: SolanaConnectionService;
  private metadataCache: Map<string, TokenMetadata>;

  constructor() {
    this.connectionService = SolanaConnectionService.getInstance();
    this.metadataCache = new Map();
  }

  async getTokenMetadata(mintAddress: string): Promise<TokenMetadata> {
    if (this.metadataCache.has(mintAddress)) {
      return this.metadataCache.get(mintAddress)!;
    }

    if (WELL_KNOWN_TOKENS[mintAddress]) {
      this.metadataCache.set(mintAddress, WELL_KNOWN_TOKENS[mintAddress]);
      return WELL_KNOWN_TOKENS[mintAddress];
    }

    try {
      const connection = this.connectionService.getConnection();
      const mintPublicKey = new PublicKey(mintAddress);
      const mintInfo = await connection.getParsedAccountInfo(mintPublicKey);

      if (mintInfo.value && 'parsed' in mintInfo.value.data) {
        const parsedData = mintInfo.value.data.parsed;
        const decimals = parsedData.info?.decimals || 9;

        const metadata: TokenMetadata = {
          mint: mintAddress,
          name: 'Unknown Token',
          symbol: mintAddress.slice(0, 4).toUpperCase(),
          decimals,
          verified: false,
        };

        this.metadataCache.set(mintAddress, metadata);
        return metadata;
      }
    } catch (error) {
      console.error('Error fetching token metadata:', error);
    }

    const fallbackMetadata: TokenMetadata = {
      mint: mintAddress,
      name: 'Unknown Token',
      symbol: mintAddress.slice(0, 4).toUpperCase(),
      decimals: 9,
      verified: false,
    };

    return fallbackMetadata;
  }

  async getBatchTokenMetadata(mintAddresses: string[]): Promise<Map<string, TokenMetadata>> {
    const results = new Map<string, TokenMetadata>();

    await Promise.all(
      mintAddresses.map(async (mint) => {
        const metadata = await this.getTokenMetadata(mint);
        results.set(mint, metadata);
      })
    );

    return results;
  }

  clearCache() {
    this.metadataCache.clear();
  }
}
