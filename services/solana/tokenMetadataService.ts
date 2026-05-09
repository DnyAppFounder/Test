/**
 * TokenMetadataService
 *
 * Resolution order for every token mint:
 *  1. In-memory cache (instant)
 *  2. Well-known tokens (SOL, USDC, USDT, JUP, BONK, …)
 *  3. Helius DAS getAsset  (primary — richest metadata, covers cNFTs + Token-2022)
 *  4. Jupiter token list   (large curated list, fast lookup)
 *  5. pump.fun API         (pump.fun mints ending in "pump")
 *  6. On-chain mint account for decimals + program type
 *  7. Graceful stub        (never throws — always returns something displayable)
 *
 * Never hides a token because metadata is missing.
 */

import Constants from 'expo-constants';
import { SolanaConnectionService } from './connectionService';
import { jupiterTokenListService } from '../jupiter/tokenListService';
import { supabase } from '@/lib/supabase';

export interface TokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  logoURI?: string;
  decimals: number;
  verified: boolean;
  /** Token program: 'spl' | 'token-2022' */
  tokenProgram?: string;
  /** Raw metadata URI (IPFS / Arweave / HTTPS) if available */
  metadataUri?: string;
}

// ─── Proxy helpers ────────────────────────────────────────────────────────────

function getProxyBase(): string {
  const url =
    Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL ||
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    '';
  return url ? `${url}/functions/v1/solana-rpc` : '';
}

function getAnonKey(): string {
  return (
    Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  );
}

function proxyHeaders(): Record<string, string> {
  const key = getAnonKey();
  return {
    'Content-Type': 'application/json',
    ...(key ? { Authorization: `Bearer ${key}`, apikey: key } : {}),
  };
}

// ─── Well-known tokens ────────────────────────────────────────────────────────

const WELL_KNOWN: Record<string, TokenMetadata> = {
  'So11111111111111111111111111111111111111112': {
    mint: 'So11111111111111111111111111111111111111112',
    name: 'Solana', symbol: 'SOL',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    decimals: 9, verified: true, tokenProgram: 'spl',
  },
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': {
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    name: 'USD Coin', symbol: 'USDC',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
    decimals: 6, verified: true, tokenProgram: 'spl',
  },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': {
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    name: 'USDT', symbol: 'USDT',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png',
    decimals: 6, verified: true, tokenProgram: 'spl',
  },
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': {
    mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    name: 'Jupiter', symbol: 'JUP',
    logoURI: 'https://static.jup.ag/jup/icon.png',
    decimals: 6, verified: true, tokenProgram: 'spl',
  },
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': {
    mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    name: 'Bonk', symbol: 'BONK',
    logoURI: 'https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I',
    decimals: 5, verified: true, tokenProgram: 'spl',
  },
  '4k3Dyjzvzp8eMrzpTGE6RkFGSNJoSz8e6oWz8S8HtFr': {
    mint: '4k3Dyjzvzp8eMrzpTGE6RkFGSNJoSz8e6oWz8S8HtFr',
    name: 'Raydium', symbol: 'RAY',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMrzpTGE6RkFGSNJoSz8e6oWz8S8HtFr/logo.png',
    decimals: 6, verified: true, tokenProgram: 'spl',
  },
  'orcaEKTdK7LKz57vaAYr6AC93NStx7QLt3pPDzBEFP': {
    mint: 'orcaEKTdK7LKz57vaAYr6AC93NStx7QLt3pPDzBEFP',
    name: 'Orca', symbol: 'ORCA',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/orcaEKTdK7LKz57vaAYr6AC93NStx7QLt3pPDzBEFP/logo.png',
    decimals: 6, verified: true, tokenProgram: 'spl',
  },
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': {
    mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
    name: 'Marinade staked SOL', symbol: 'mSOL',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png',
    decimals: 9, verified: true, tokenProgram: 'spl',
  },
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs': {
    mint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
    name: 'Ether (Portal)', symbol: 'ETH',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs/logo.png',
    decimals: 8, verified: true, tokenProgram: 'spl',
  },
  '43m6D8gCagyJ4K6NjETr3wjSUUSAAwaFznKbCUECpump': {
    mint: '43m6D8gCagyJ4K6NjETr3wjSUUSAAwaFznKbCUECpump',
    name: 'DTEST', symbol: 'DTEST',
    logoURI: undefined,
    decimals: 6, verified: true, tokenProgram: 'spl',
  },
};

// ─── Metadata URI cache (IPFS / Arweave / HTTPS) ─────────────────────────────

const URI_CACHE = new Map<string, string | null>();

async function resolveImageFromUri(uri: string): Promise<string | undefined> {
  if (!uri) return undefined;
  if (URI_CACHE.has(uri)) return URI_CACHE.get(uri) ?? undefined;

  let fetchUri = uri;
  if (uri.startsWith('ipfs://')) {
    fetchUri = `https://cloudflare-ipfs.com/ipfs/${uri.slice(7)}`;
  } else if (uri.startsWith('ar://')) {
    fetchUri = `https://arweave.net/${uri.slice(5)}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(fetchUri, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) { URI_CACHE.set(uri, null); return undefined; }
    const json = await res.json();
    const image: string | undefined =
      json?.image || json?.image_url || json?.properties?.files?.[0]?.uri;
    URI_CACHE.set(uri, image ?? null);
    return image;
  } catch {
    URI_CACHE.set(uri, null);
    return undefined;
  }
}

// ─── DAWEN Launchpad DB resolver ──────────────────────────────────────────────
// Newly created tokens appear here immediately after launch, before any indexer

async function fetchLaunchpadMetadata(mint: string): Promise<TokenMetadata | null> {
  try {
    const { data } = await supabase
      .from('launchpad_tokens')
      .select('name, symbol, image_url, decimals')
      .eq('mint_address', mint)
      .in('status', ['deployed', 'pending'])
      .maybeSingle();
    if (!data?.name) return null;
    return {
      mint,
      name: data.name,
      symbol: data.symbol,
      logoURI: data.image_url || undefined,
      decimals: data.decimals ?? 6,
      verified: false,
      tokenProgram: 'spl',
    };
  } catch {
    return null;
  }
}

async function fetchLaunchpadMetadataBatch(mints: string[]): Promise<Map<string, TokenMetadata>> {
  const result = new Map<string, TokenMetadata>();
  if (mints.length === 0) return result;
  try {
    const { data } = await supabase
      .from('launchpad_tokens')
      .select('mint_address, name, symbol, image_url, decimals')
      .in('mint_address', mints)
      .in('status', ['deployed', 'pending']);
    for (const row of data ?? []) {
      if (!row.mint_address || !row.name) continue;
      result.set(row.mint_address, {
        mint: row.mint_address,
        name: row.name,
        symbol: row.symbol,
        logoURI: row.image_url || undefined,
        decimals: row.decimals ?? 6,
        verified: false,
        tokenProgram: 'spl',
      });
    }
  } catch {}
  return result;
}

// ─── Helius DAS single-asset resolver ────────────────────────────────────────

function parseDasAsset(mint: string, asset: any): TokenMetadata | null {
  if (!asset) return null;

  const contentMeta = asset.content?.metadata || {};
  const name: string = (contentMeta.name || '').trim();
  const symbol: string = (contentMeta.symbol || '').trim();
  if (!name && !symbol) return null;

  const decimals: number = typeof asset.token_info?.decimals === 'number'
    ? asset.token_info.decimals : 6;
  const tokenProgramRaw: string = asset.token_info?.token_program || '';
  const tokenProgram = tokenProgramRaw.includes('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')
    ? 'token-2022' : 'spl';

  const links = asset.content?.links || {};
  const logoURI: string | undefined =
    links.image ||
    asset.content?.files?.[0]?.cdn_uri ||
    asset.content?.files?.[0]?.uri ||
    undefined;

  const metadataUri: string | undefined = asset.content?.json_uri || undefined;
  const verified = !!(asset.authorities?.length > 0 || asset.creators?.some((c: any) => c.verified));

  return {
    mint,
    name: name || symbol || mint.slice(0, 8),
    symbol: symbol || name.split(' ')[0].toUpperCase().slice(0, 10) || mint.slice(0, 4).toUpperCase(),
    logoURI,
    decimals,
    verified,
    tokenProgram,
    metadataUri,
  };
}

async function fetchDasMetadata(mint: string): Promise<TokenMetadata | null> {
  const proxy = getProxyBase();
  if (!proxy) return null;

  try {
    const res = await fetch(`${proxy}?action=das`, {
      method: 'POST',
      headers: proxyHeaders(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'getAsset',
        method: 'getAsset',
        params: { id: mint },
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const meta = parseDasAsset(mint, json?.result);
    if (!meta) return null;

    // If DAS gave us a metadata URI but no direct image, try to resolve it
    if (!meta.logoURI && meta.metadataUri) {
      meta.logoURI = await resolveImageFromUri(meta.metadataUri);
    }

    console.log(`[TokenMetadata] DAS: ${meta.symbol} decimals=${meta.decimals} program=${meta.tokenProgram} (${mint.slice(0, 8)})`);
    return meta;
  } catch (e: any) {
    console.warn('[TokenMetadata] DAS single error:', mint.slice(0, 8), e?.message?.slice(0, 60));
    return null;
  }
}

async function fetchDasMetadataBatch(mints: string[]): Promise<Map<string, TokenMetadata>> {
  const result = new Map<string, TokenMetadata>();
  if (mints.length === 0) return result;

  const proxy = getProxyBase();
  if (!proxy) return result;

  const BATCH = 100;
  const batches: string[][] = [];
  for (let i = 0; i < mints.length; i += BATCH) batches.push(mints.slice(i, i + BATCH));

  await Promise.all(batches.map(async (batch) => {
    try {
      const res = await fetch(`${proxy}?action=das`, {
        method: 'POST',
        headers: proxyHeaders(),
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'getAssetBatch',
          method: 'getAssetBatch',
          params: { ids: batch },
        }),
      });
      if (!res.ok) return;
      const json = await res.json();
      const assets: any[] = Array.isArray(json?.result) ? json.result : [];
      for (const asset of assets) {
        if (!asset?.id) continue;
        const meta = parseDasAsset(asset.id, asset);
        if (meta) result.set(asset.id, meta);
      }
      console.log(`[TokenMetadata] DAS batch: ${result.size}/${batch.length} resolved`);
    } catch (e: any) {
      console.warn('[TokenMetadata] DAS batch error:', e?.message?.slice(0, 60));
    }
  }));

  return result;
}

// ─── pump.fun resolver ────────────────────────────────────────────────────────

async function fetchPumpFunMetadata(mint: string): Promise<TokenMetadata | null> {
  if (!mint.endsWith('pump')) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://frontend-api.pump.fun/coins/${mint}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.symbol) return null;

    let logoURI: string | undefined = data.image_uri || undefined;
    if (!logoURI && data.metadata_uri) {
      logoURI = await resolveImageFromUri(data.metadata_uri);
    }

    return {
      mint,
      name: data.name || data.symbol,
      symbol: data.symbol,
      logoURI,
      decimals: 6,
      verified: false,
      tokenProgram: 'spl',
    };
  } catch {
    return null;
  }
}

// ─── On-chain mint info (decimals + program, last resort) ─────────────────────

async function fetchOnChainMintInfo(
  mint: string,
  conn: SolanaConnectionService
): Promise<{ decimals: number; tokenProgram: string } | null> {
  try {
    const result = await conn.rpcCall('getAccountInfo', [
      mint,
      { encoding: 'jsonParsed', commitment: 'confirmed' },
    ]);
    const parsed = result?.value?.data?.parsed;
    if (!parsed) return null;
    const decimals: number = parsed.info?.decimals ?? 6;
    const owner: string = result?.value?.owner || '';
    const tokenProgram = owner.includes('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')
      ? 'token-2022' : 'spl';
    return { decimals, tokenProgram };
  } catch {
    return null;
  }
}

// ─── TokenMetadataService ─────────────────────────────────────────────────────

export class TokenMetadataService {
  private connectionService: SolanaConnectionService;
  private cache = new Map<string, TokenMetadata>();

  constructor() {
    this.connectionService = SolanaConnectionService.getInstance();
  }

  async getTokenMetadata(mint: string): Promise<TokenMetadata> {
    // 1. Cache
    if (this.cache.has(mint)) return this.cache.get(mint)!;

    // 2. Well-known
    if (WELL_KNOWN[mint]) {
      this.cache.set(mint, WELL_KNOWN[mint]);
      return WELL_KNOWN[mint];
    }

    // 3. DAWEN launchpad DB — immediate fallback for newly created tokens
    const launchpadMeta = await fetchLaunchpadMetadata(mint);
    if (launchpadMeta) {
      this.cache.set(mint, launchpadMeta);
      return launchpadMeta;
    }

    // 4. Helius DAS (primary for external tokens)
    const dasMeta = await fetchDasMetadata(mint);
    if (dasMeta) {
      this.cache.set(mint, dasMeta);
      return dasMeta;
    }

    // 5. Jupiter token list (large curated list)
    try {
      const jupToken = await jupiterTokenListService.getTokenByAddress(mint);
      if (jupToken) {
        const meta: TokenMetadata = {
          mint,
          name: jupToken.name,
          symbol: jupToken.symbol,
          logoURI: jupToken.logoURI,
          decimals: jupToken.decimals,
          verified: !!(jupToken.tags?.includes('verified') || jupToken.tags?.includes('strict')),
          tokenProgram: 'spl',
        };
        console.log(`[TokenMetadata] Jupiter: ${meta.symbol} (${mint.slice(0, 8)})`);
        this.cache.set(mint, meta);
        return meta;
      }
    } catch {}

    // 6. pump.fun
    const pumpMeta = await fetchPumpFunMetadata(mint);
    if (pumpMeta) {
      this.cache.set(mint, pumpMeta);
      return pumpMeta;
    }

    // 7. On-chain mint account (for decimals + program type)
    const onChain = await fetchOnChainMintInfo(mint, this.connectionService);

    // 8. Graceful stub — never hide the token. Do NOT cache: a new DAWEN token may
    // be indexed by Helius or the launchpad DB shortly after launch, so subsequent
    // calls should retry all resolution steps rather than returning a stale stub.
    return {
      mint,
      name: mint.slice(0, 8) + '...',
      symbol: mint.slice(0, 4).toUpperCase(),
      logoURI: undefined,
      decimals: onChain?.decimals ?? 6,
      verified: false,
      tokenProgram: onChain?.tokenProgram ?? 'spl',
    };
  }

  async getBatchTokenMetadata(mints: string[]): Promise<Map<string, TokenMetadata>> {
    const results = new Map<string, TokenMetadata>();

    // Split into already-resolved vs needs-fetch
    const needsFetch: string[] = [];
    for (const mint of mints) {
      if (this.cache.has(mint)) {
        results.set(mint, this.cache.get(mint)!);
      } else if (WELL_KNOWN[mint]) {
        this.cache.set(mint, WELL_KNOWN[mint]);
        results.set(mint, WELL_KNOWN[mint]);
      } else {
        needsFetch.push(mint);
      }
    }

    if (needsFetch.length === 0) return results;

    // Launchpad DB batch — immediately resolves newly created DAWEN tokens
    const launchpadResults = await fetchLaunchpadMetadataBatch(needsFetch);
    for (const [mint, meta] of launchpadResults) {
      this.cache.set(mint, meta);
      results.set(mint, meta);
    }

    // DAS batch for mints not found in launchpad
    const needsDas = needsFetch.filter(m => !results.has(m));
    const dasResults = await fetchDasMetadataBatch(needsDas);
    for (const [mint, meta] of dasResults) {
      this.cache.set(mint, meta);
      results.set(mint, meta);
    }

    // Individual fallback for any still missing
    const stillMissing = needsFetch.filter(m => !results.has(m));
    await Promise.all(
      stillMissing.map(async (mint) => {
        const meta = await this.getTokenMetadata(mint);
        results.set(mint, meta);
      })
    );

    return results;
  }

  clearCache() {
    this.cache.clear();
  }
}
