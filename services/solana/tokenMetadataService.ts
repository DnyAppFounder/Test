/**
 * TokenMetadataService
 *
 * Resolution order for every token mint:
 *  1. In-memory cache (instant; logo-less entries expire and retry after 5 min)
 *  2. Well-known tokens with confirmed logos (SOL, USDC, USDT, JUP, BONK, …)
 *     – tokens in WELL_KNOWN without a logo fall through to full resolution
 *  3. DAWEN Launchpad DB  (immediate for freshly created DAWEN tokens)
 *  4. Helius DAS getAsset (primary — richest metadata, covers cNFTs + Token-2022)
 *     – if DAS finds no logo for a pump.fun mint, also tries pump.fun API
 *  5. Jupiter token list  (large curated list, fast lookup)
 *  6. pump.fun API        (pump.fun mints ending in "pump")
 *  7. On-chain mint account (decimals + program type)
 *  8. Graceful stub       (never throws — always returns something displayable)
 *
 * Logo resolution rules:
 *  - Successful logos are cached permanently.
 *  - Missing logos are retried after LOGO_RETRY_MS (5 min) so fresh tokens
 *    don't stay blank forever once their metadata propagates.
 *  - Metadata URI fetches (IPFS / Arweave) also use a 5-min failure TTL.
 *  - No fake logos are ever generated.
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

// ─── Well-known tokens (fast path for tokens with confirmed logos) ─────────────
// Entries without a logoURI fall through to full DAS/pump.fun resolution.

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
  // DWORLD: well-known name/symbol/decimals — logo resolved dynamically via DAS/pump.fun
  'BW1T8pZB2S18nPyMP4sUySV5FoC3VboX6vg3nmvQpump': {
    mint: 'BW1T8pZB2S18nPyMP4sUySV5FoC3VboX6vg3nmvQpump',
    name: 'DAWORLD Coin', symbol: 'DWORLD',
    logoURI: undefined, // resolved below — not a hard-coded fake
    decimals: 6, verified: true, tokenProgram: 'token2022',
  },
};

// ─── Metadata URI cache ────────────────────────────────────────────────────────
// Successful hits are cached permanently; failures expire after MISS_TTL_MS.

const URI_HIT  = new Map<string, string>();   // uri → resolved image URL (permanent)
const URI_MISS = new Map<string, number>();   // uri → timestamp of last failure
const URI_MISS_TTL_MS = 5 * 60 * 1000;       // 5 min retry window

async function resolveImageFromUri(uri: string): Promise<string | undefined> {
  if (!uri) return undefined;

  // Permanent hit
  const hit = URI_HIT.get(uri);
  if (hit) return hit;

  // Recent failure — skip until TTL expires
  const missTs = URI_MISS.get(uri);
  if (missTs && Date.now() - missTs < URI_MISS_TTL_MS) return undefined;

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

    if (!res.ok) {
      URI_MISS.set(uri, Date.now());
      return undefined;
    }

    const json = await res.json();
    // Support all common metadata image fields
    const image: string | undefined =
      json?.image ||
      json?.image_url ||
      json?.logoURI ||
      json?.uri ||
      json?.properties?.files?.[0]?.cdn_uri ||
      json?.properties?.files?.[0]?.uri;

    if (image) {
      URI_HIT.set(uri, image);
      return image;
    }
    URI_MISS.set(uri, Date.now());
    return undefined;
  } catch {
    URI_MISS.set(uri, Date.now());
    return undefined;
  }
}

/** Normalize a raw image URL: convert ipfs:// / ar:// to HTTPS gateway URLs. */
function normalizeImageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('ipfs://')) return `https://cloudflare-ipfs.com/ipfs/${url.slice(7)}`;
  if (url.startsWith('ar://')) return `https://arweave.net/${url.slice(5)}`;
  return url;
}

// ─── DAWEN Launchpad DB resolver ──────────────────────────────────────────────

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
      logoURI: normalizeImageUrl(data.image_url) || undefined,
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
        logoURI: normalizeImageUrl(row.image_url) || undefined,
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
  const rawImage: string | undefined =
    links.image ||
    asset.content?.files?.[0]?.cdn_uri ||
    asset.content?.files?.[0]?.uri ||
    undefined;
  const logoURI = normalizeImageUrl(rawImage);

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
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const meta = parseDasAsset(mint, json?.result);
    if (!meta) return null;

    // If DAS gave us a metadata URI but no direct image, resolve it
    if (!meta.logoURI && meta.metadataUri) {
      meta.logoURI = await resolveImageFromUri(meta.metadataUri);
    }

    return meta;
  } catch (e: any) {
    const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    console.warn(`[TokenMetadata] DAS ${isTimeout ? 'timeout (8s)' : 'error'}:`, mint.slice(0, 8), e?.message?.slice(0, 60));
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
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return;
      const json = await res.json();
      const assets: any[] = Array.isArray(json?.result) ? json.result : [];
      for (const asset of assets) {
        if (!asset?.id) continue;
        const meta = parseDasAsset(asset.id, asset);
        if (meta) result.set(asset.id, meta);
      }
    } catch (e: any) {
      const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
      console.warn(`[TokenMetadata] DAS batch ${isTimeout ? 'timeout (10s)' : 'error'}:`, e?.message?.slice(0, 60));
    }
  }));

  // Resolve metadata URIs for tokens that DAS found but without a direct image.
  // Run in parallel (same behaviour as single-asset fetchDasMetadata).
  const needsUriResolve = Array.from(result.entries()).filter(
    ([, meta]) => !meta.logoURI && meta.metadataUri
  );
  if (needsUriResolve.length > 0) {
    await Promise.all(needsUriResolve.map(async ([mint, meta]) => {
      const image = await resolveImageFromUri(meta.metadataUri!);
      if (image) {
        meta.logoURI = image;
        result.set(mint, meta);
      }
    }));
  }

  // For pump.fun mints still without a logo, try the pump.fun API.
  const needsPump = Array.from(result.entries()).filter(
    ([mint, meta]) => !meta.logoURI && mint.endsWith('pump')
  );
  if (needsPump.length > 0) {
    await Promise.all(needsPump.map(async ([mint, meta]) => {
      const pumpMeta = await fetchPumpFunMetadata(mint);
      if (pumpMeta?.logoURI) {
        meta.logoURI = pumpMeta.logoURI;
        result.set(mint, meta);
      }
    }));
  }

  return result;
}

// ─── pump.fun resolver ────────────────────────────────────────────────────────

async function fetchPumpFunMetadata(mint: string): Promise<TokenMetadata | null> {
  if (!mint.endsWith('pump')) return null;
  try {
    // Route through the solana-rpc proxy to avoid browser CORS restrictions.
    const proxy = getProxyBase();
    let res: Response | null = null;
    if (proxy) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      res = await fetch(`${proxy}?action=pumpfun&mint=${mint}`, {
        headers: proxyHeaders(),
        signal: ctrl.signal,
      });
      clearTimeout(t);
    } else {
      // Fallback: direct fetch (works in non-browser / native environments)
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      res = await fetch(`https://frontend-api.pump.fun/coins/${mint}`, {
        headers: { Accept: 'application/json' },
        signal: ctrl.signal,
      });
      clearTimeout(t);
    }
    if (!res || !res.ok) return null;
    const data = await res.json();
    if (!data?.symbol) return null;

    let logoURI: string | undefined = normalizeImageUrl(data.image_uri) || undefined;
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

// ─── Merge helper ─────────────────────────────────────────────────────────────
// Prefer well-known base for name/symbol/decimals/program; prefer resolved for logo.

function mergeWithWellKnown(base: TokenMetadata, resolved: TokenMetadata): TokenMetadata {
  return {
    ...resolved,
    name:         base.name        || resolved.name,
    symbol:       base.symbol      || resolved.symbol,
    decimals:     base.decimals    ?? resolved.decimals,
    tokenProgram: base.tokenProgram || resolved.tokenProgram,
    verified:     base.verified    || resolved.verified,
    logoURI:      resolved.logoURI || base.logoURI,
  };
}

// ─── TokenMetadataService ─────────────────────────────────────────────────────

// Retry logo resolution for cached no-logo entries after this interval.
const LOGO_RETRY_MS = 5 * 60 * 1000;

export class TokenMetadataService {
  private connectionService: SolanaConnectionService;
  private cache = new Map<string, TokenMetadata>();
  // Tracks when we last tried (and failed) to find a logo for a mint.
  // When the TTL expires, the cache entry is evicted and resolution retries.
  private logoPendingAt = new Map<string, number>();

  constructor() {
    this.connectionService = SolanaConnectionService.getInstance();
  }

  async getTokenMetadata(mint: string): Promise<TokenMetadata> {
    // 1. Cache — evict no-logo entries after LOGO_RETRY_MS so metadata
    //    propagation is picked up without requiring an app restart.
    const cached = this.cache.get(mint);
    if (cached) {
      if (cached.logoURI) return cached; // logo present → permanent cache hit
      const pendingAt = this.logoPendingAt.get(mint);
      if (pendingAt && Date.now() - pendingAt < LOGO_RETRY_MS) return cached;
      // TTL expired — evict and re-resolve
      this.cache.delete(mint);
      this.logoPendingAt.delete(mint);
    }

    // 2. Well-known tokens with confirmed logos (instant, no network)
    const wellKnown = WELL_KNOWN[mint];
    if (wellKnown?.logoURI) {
      this.cache.set(mint, wellKnown);
      return wellKnown;
    }
    // If well-known entry exists but has no logo, we use it as the base
    // and fall through to dynamic resolution to find the real image.

    // 3. DAWEN launchpad DB — immediate for newly created tokens
    const launchpadMeta = await fetchLaunchpadMetadata(mint);
    if (launchpadMeta) {
      const result = wellKnown ? mergeWithWellKnown(wellKnown, launchpadMeta) : launchpadMeta;
      this.cache.set(mint, result);
      if (!result.logoURI) this.logoPendingAt.set(mint, Date.now());
      return result;
    }

    // 4. Helius DAS (primary for external tokens)
    const dasMeta = await fetchDasMetadata(mint);
    if (dasMeta) {
      // For pump.fun mints where DAS found metadata but no logo, also try pump.fun API
      if (!dasMeta.logoURI && mint.endsWith('pump')) {
        const pumpMeta = await fetchPumpFunMetadata(mint);
        if (pumpMeta?.logoURI) dasMeta.logoURI = pumpMeta.logoURI;
      }
      const result = wellKnown ? mergeWithWellKnown(wellKnown, dasMeta) : dasMeta;
      this.cache.set(mint, result);
      if (!result.logoURI) this.logoPendingAt.set(mint, Date.now());
      return result;
    }

    // 5. Jupiter token list
    try {
      const jupToken = await jupiterTokenListService.getTokenByAddress(mint);
      if (jupToken) {
        const meta: TokenMetadata = {
          mint,
          name:         wellKnown?.name        || jupToken.name,
          symbol:       wellKnown?.symbol      || jupToken.symbol,
          logoURI:      normalizeImageUrl(jupToken.logoURI) || wellKnown?.logoURI,
          decimals:     wellKnown?.decimals    ?? jupToken.decimals,
          verified:     !!(jupToken.tags?.includes('verified') || jupToken.tags?.includes('strict')),
          tokenProgram: wellKnown?.tokenProgram || 'spl',
        };
        this.cache.set(mint, meta);
        if (!meta.logoURI) this.logoPendingAt.set(mint, Date.now());
        return meta;
      }
    } catch {}

    // 6. pump.fun (for any pump.fun mint not yet indexed by DAS)
    const pumpMeta = await fetchPumpFunMetadata(mint);
    if (pumpMeta) {
      const result = wellKnown ? mergeWithWellKnown(wellKnown, pumpMeta) : pumpMeta;
      this.cache.set(mint, result);
      if (!result.logoURI) this.logoPendingAt.set(mint, Date.now());
      return result;
    }

    // 7. On-chain mint account (decimals + program type, last resort)
    const onChain = await fetchOnChainMintInfo(mint, this.connectionService);

    // If we have a well-known base, return it merged with on-chain data.
    // Do NOT cache — logo may appear once DAS/pump.fun index the token.
    if (wellKnown) {
      return {
        ...wellKnown,
        decimals:     onChain?.decimals     ?? wellKnown.decimals,
        tokenProgram: onChain?.tokenProgram ?? wellKnown.tokenProgram,
      };
    }

    // 8. Graceful stub — never hides a token.
    // Do NOT cache so subsequent calls retry all resolution steps.
    return {
      mint,
      name:         mint.slice(0, 8) + '...',
      symbol:       mint.slice(0, 4).toUpperCase(),
      logoURI:      undefined,
      decimals:     onChain?.decimals     ?? 6,
      verified:     false,
      tokenProgram: onChain?.tokenProgram ?? 'spl',
    };
  }

  async getBatchTokenMetadata(mints: string[]): Promise<Map<string, TokenMetadata>> {
    const results = new Map<string, TokenMetadata>();

    // Split into already-resolved (with logo) vs needs-fetch
    const needsFetch: string[] = [];
    for (const mint of mints) {
      const cached = this.cache.get(mint);
      if (cached?.logoURI) {
        results.set(mint, cached);
      } else if (WELL_KNOWN[mint]?.logoURI) {
        this.cache.set(mint, WELL_KNOWN[mint]);
        results.set(mint, WELL_KNOWN[mint]);
      } else {
        needsFetch.push(mint);
      }
    }

    if (needsFetch.length === 0) return results;

    // Launchpad DB batch
    const launchpadResults = await fetchLaunchpadMetadataBatch(needsFetch);
    for (const [mint, meta] of launchpadResults) {
      const wellKnown = WELL_KNOWN[mint];
      const result = wellKnown ? mergeWithWellKnown(wellKnown, meta) : meta;
      this.cache.set(mint, result);
      if (!result.logoURI) this.logoPendingAt.set(mint, Date.now());
      results.set(mint, result);
    }

    // DAS batch for mints not found in launchpad
    const needsDas = needsFetch.filter(m => !results.has(m));
    const dasResults = await fetchDasMetadataBatch(needsDas);
    for (const [mint, meta] of dasResults) {
      const wellKnown = WELL_KNOWN[mint];
      const result = wellKnown ? mergeWithWellKnown(wellKnown, meta) : meta;
      this.cache.set(mint, result);
      if (!result.logoURI) this.logoPendingAt.set(mint, Date.now());
      results.set(mint, result);
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
    this.logoPendingAt.clear();
  }
}

/** Shared singleton — use this instead of constructing new instances. */
export const tokenMetadataService = new TokenMetadataService();
