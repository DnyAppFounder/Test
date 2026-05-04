import { SolanaConnectionService } from './connectionService';
import { jupiterTokenListService } from '../jupiter/tokenListService';

export interface TokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  logoURI?: string;
  decimals: number;
  verified: boolean;
}

// Well-known tokens with guaranteed metadata
const WELL_KNOWN_TOKENS: Record<string, TokenMetadata> = {
  'So11111111111111111111111111111111111111112': {
    mint: 'So11111111111111111111111111111111111111112',
    name: 'Solana', symbol: 'SOL',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    decimals: 9, verified: true,
  },
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': {
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    name: 'USD Coin', symbol: 'USDC',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
    decimals: 6, verified: true,
  },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': {
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    name: 'USDT', symbol: 'USDT',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png',
    decimals: 6, verified: true,
  },
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': {
    mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    name: 'Jupiter', symbol: 'JUP',
    logoURI: 'https://static.jup.ag/jup/icon.png',
    decimals: 6, verified: true,
  },
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': {
    mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    name: 'Bonk', symbol: 'BONK',
    logoURI: 'https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I',
    decimals: 5, verified: true,
  },
  '4k3Dyjzvzp8eMrzpTGE6RkFGSNJoSz8e6oWz8S8HtFr': {
    mint: '4k3Dyjzvzp8eMrzpTGE6RkFGSNJoSz8e6oWz8S8HtFr',
    name: 'Raydium', symbol: 'RAY',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMrzpTGE6RkFGSNJoSz8e6oWz8S8HtFr/logo.png',
    decimals: 6, verified: true,
  },
  'orcaEKTdK7LKz57vaAYr6AC93NStx7QLt3pPDzBEFP': {
    mint: 'orcaEKTdK7LKz57vaAYr6AC93NStx7QLt3pPDzBEFP',
    name: 'Orca', symbol: 'ORCA',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/orcaEKTdK7LKz57vaAYr6AC93NStx7QLt3pPDzBEFP/logo.png',
    decimals: 6, verified: true,
  },
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': {
    mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
    name: 'Marinade staked SOL', symbol: 'mSOL',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png',
    decimals: 9, verified: true,
  },
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs': {
    mint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
    name: 'Ether (Portal)', symbol: 'ETH',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs/logo.png',
    decimals: 8, verified: true,
  },
  // DTEST / DAWEN token (pump.fun)
  '43m6D8gCagyJ4K6NjETr3wjSUUSAAwaFznKbCUECpump': {
    mint: '43m6D8gCagyJ4K6NjETr3wjSUUSAAwaFznKbCUECpump',
    name: 'DTEST', symbol: 'DTEST',
    logoURI: undefined,
    decimals: 6, verified: true,
  },
};

/** Try pump.fun / DexScreener for metadata on pump.fun tokens (mint ends in "pump") */
async function fetchPumpFunMetadata(mintAddress: string): Promise<TokenMetadata | null> {
  // Only attempt for pump.fun mints to avoid slow calls for other unknowns
  if (!mintAddress.endsWith('pump')) return null;
  try {
    const res = await fetch(`https://frontend-api.pump.fun/coins/${mintAddress}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.symbol) return null;
    return {
      mint: mintAddress,
      name: data.name || data.symbol,
      symbol: data.symbol,
      logoURI: data.image_uri || data.metadata_uri || undefined,
      decimals: 6,
      verified: false,
    };
  } catch {
    return null;
  }
}

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

    // 1. Jupiter token list
    try {
      const jupToken = await jupiterTokenListService.getTokenByAddress(mintAddress);
      if (jupToken) {
        const metadata: TokenMetadata = {
          mint: mintAddress,
          name: jupToken.name,
          symbol: jupToken.symbol,
          logoURI: jupToken.logoURI,
          decimals: jupToken.decimals,
          verified: true,
        };
        console.log('[TokenMetadata] Resolved from Jupiter:', jupToken.symbol, mintAddress.slice(0, 8));
        this.metadataCache.set(mintAddress, metadata);
        return metadata;
      }
    } catch {}

    // 2. pump.fun API for pump.fun tokens
    const pumpMeta = await fetchPumpFunMetadata(mintAddress);
    if (pumpMeta) {
      console.log('[TokenMetadata] Resolved from pump.fun:', pumpMeta.symbol, mintAddress.slice(0, 8));
      this.metadataCache.set(mintAddress, pumpMeta);
      return pumpMeta;
    }

    // 3. On-chain mint account for decimals
    try {
      const result = await this.connectionService.rpcCall('getAccountInfo', [
        mintAddress,
        { encoding: 'jsonParsed', commitment: 'confirmed' },
      ]);

      if (result?.value?.data?.parsed) {
        const decimals: number = result.value.data.parsed.info?.decimals ?? 9;
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
    } catch {}

    // 4. Minimal fallback — still shows the token
    const fallback: TokenMetadata = {
      mint: mintAddress,
      name: 'Unknown Token',
      symbol: mintAddress.slice(0, 4).toUpperCase(),
      decimals: 6,
      verified: false,
    };
    this.metadataCache.set(mintAddress, fallback);
    return fallback;
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
