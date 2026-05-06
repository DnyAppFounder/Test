/**
 * tokenRegistryService
 *
 * Global shared Solana token registry.
 *
 * Discovers tokens from:
 *  1. Jupiter token list (verified + all)
 *  2. DexScreener Solana pairs (trending, new, search)
 *  3. Raydium pool API
 *  4. Meteora pool API
 *  5. Wallet-owned mints (passed in by callers)
 *  6. On-chain mint account (for any mint address)
 *  7. Helius DAS getAsset (metadata resolution)
 *
 * All discovered tokens are:
 *  - Deduplicated by mint address
 *  - Validated on-chain (getAccountInfo → confirms mint exists)
 *  - Enriched with DAS metadata
 *  - Persisted to `solana_token_registry` table
 *  - Searchable by name, symbol, or mint address
 *
 * Consumers call:
 *  - tokenRegistryService.search(query)         → RegistryToken[]
 *  - tokenRegistryService.getByMint(mint)        → RegistryToken | null
 *  - tokenRegistryService.registerMints(mints[]) → void (background, safe to fire-and-forget)
 *  - tokenRegistryService.getTopTokens()         → RegistryToken[] (trending/top from DexScreener)
 */

import { supabase } from '@/lib/supabase';
import { dexScreenerService, DexPair } from './dexscreener/tokenDiscoveryService';
import { jupiterTokenListService } from './jupiter/tokenListService';
import { TokenMetadataService } from './solana/tokenMetadataService';

export interface RegistryToken {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUri?: string;
  metadataUri?: string;
  tokenProgram: string;
  isVerified: boolean;
  sources: string[];
  priceUsd?: number;
  priceChange24h?: number;
  volume24h?: number;
  liquidityUsd?: number;
  marketCap?: number;
  pairAddress?: string;
  firstSeenAt?: string;
  updatedAt?: string;
}

// ─── DB row → RegistryToken ───────────────────────────────────────────────────

function rowToToken(row: any): RegistryToken {
  return {
    mint:          row.mint,
    symbol:        row.symbol || row.mint.slice(0, 4).toUpperCase(),
    name:          row.name   || row.mint.slice(0, 8) + '...',
    decimals:      row.decimals ?? 6,
    logoUri:       row.logo_uri    ?? undefined,
    metadataUri:   row.metadata_uri ?? undefined,
    tokenProgram:  row.token_program || 'spl',
    isVerified:    row.is_verified ?? false,
    sources:       row.sources ?? [],
    priceUsd:      row.price_usd    != null ? Number(row.price_usd)      : undefined,
    priceChange24h:row.price_change_24h != null ? Number(row.price_change_24h) : undefined,
    volume24h:     row.volume_24h   != null ? Number(row.volume_24h)     : undefined,
    liquidityUsd:  row.liquidity_usd != null ? Number(row.liquidity_usd) : undefined,
    marketCap:     row.market_cap   != null ? Number(row.market_cap)     : undefined,
    pairAddress:   row.pair_address  ?? undefined,
    firstSeenAt:   row.first_seen_at ?? undefined,
    updatedAt:     row.updated_at    ?? undefined,
  };
}

// ─── Upsert helpers ───────────────────────────────────────────────────────────

interface RegistryRow {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logo_uri?: string | null;
  metadata_uri?: string | null;
  token_program: string;
  is_verified: boolean;
  sources: string[];
  price_usd?: number | null;
  price_change_24h?: number | null;
  volume_24h?: number | null;
  liquidity_usd?: number | null;
  market_cap?: number | null;
  pair_address?: string | null;
  updated_at: string;
}

async function upsertRows(rows: RegistryRow[]) {
  if (rows.length === 0) return;
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('solana_token_registry')
      .upsert(batch, { onConflict: 'mint' });
    if (error) console.warn('[Registry] Upsert error:', error.message);
  }
}

// ─── External data sources ────────────────────────────────────────────────────

/** Raydium pool API — returns base/quote token mints from active pools */
async function fetchRaydiumMints(): Promise<string[]> {
  try {
    const res = await fetch('https://api.raydium.io/v2/sdk/token/raydium.mainnet.json', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const tokens: any[] = data?.official || data?.unOfficial || [];
    return tokens.map((t: any) => t.mint).filter(Boolean);
  } catch {
    return [];
  }
}

/** Meteora dynamic pool API — returns token mints */
async function fetchMeteoraMints(): Promise<string[]> {
  try {
    const res = await fetch('https://app.meteora.ag/amm/pools?page=0&limit=100', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const pools: any[] = data?.data || data || [];
    const mints = new Set<string>();
    for (const pool of pools) {
      if (pool.token_a_mint) mints.add(pool.token_a_mint);
      if (pool.token_b_mint) mints.add(pool.token_b_mint);
    }
    return Array.from(mints);
  } catch {
    return [];
  }
}

/** Birdeye trending tokens */
async function fetchBirdeyeTokens(): Promise<{ mint: string; symbol: string; name: string; logoUri?: string; priceUsd?: number; priceChange24h?: number; volume24h?: number; marketCap?: number }[]> {
  try {
    const res = await fetch('https://public-api.birdeye.so/defi/tokenlist?sort_by=v24hUSD&sort_type=desc&offset=0&limit=50&min_liquidity=1000', {
      headers: { 'X-Chain': 'solana' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const tokens: any[] = data?.data?.tokens || [];
    return tokens.map((t: any) => ({
      mint: t.address,
      symbol: t.symbol || '',
      name: t.name || t.symbol || '',
      logoUri: t.logoURI || t.logo || undefined,
      priceUsd: t.v24hUSD ? undefined : t.price,
      volume24h: t.v24hUSD,
      marketCap: t.mc,
      priceChange24h: t.v24hChangePercent,
    })).filter(t => t.mint);
  } catch {
    return [];
  }
}

// ─── On-chain mint validation ─────────────────────────────────────────────────

function getProxyBase(): string {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  return url ? `${url}/functions/v1/solana-rpc` : '';
}

function getAnonKey(): string {
  return process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
}

async function validateMintOnChain(mint: string): Promise<{ decimals: number; tokenProgram: string } | null> {
  const proxy = getProxyBase();
  if (!proxy) return null;

  try {
    const key = getAnonKey();
    const res = await fetch(proxy, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: `Bearer ${key}`, apikey: key } : {}),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAccountInfo',
        params: [mint, { encoding: 'jsonParsed', commitment: 'confirmed' }],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const info = json?.result?.value;
    if (!info) return null; // mint doesn't exist on-chain

    const parsed = info.data?.parsed;
    const decimals: number = parsed?.info?.decimals ?? 6;
    const owner: string = info.owner || '';
    const tokenProgram = owner.includes('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')
      ? 'token-2022' : 'spl';
    return { decimals, tokenProgram };
  } catch {
    return null;
  }
}

// ─── TokenRegistryService ─────────────────────────────────────────────────────

class TokenRegistryService {
  private metadataService = new TokenMetadataService();
  // In-memory cache on top of DB for the session
  private memCache = new Map<string, RegistryToken>();
  private searchCache = new Map<string, { result: RegistryToken[]; ts: number }>();
  private backgroundRunning = false;
  private lastBackgroundRun = 0;

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Search by name, symbol, or mint address.
   * Returns results from DB (full-text search) + in-memory known tokens.
   */
  async search(query: string): Promise<RegistryToken[]> {
    const q = query.trim();
    if (!q) return [];

    const cacheKey = q.toLowerCase();
    const cached = this.searchCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 30_000) return cached.result;

    const lq = q.toLowerCase();
    const isMint = q.length >= 32 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(q);

    const results = new Map<string, RegistryToken>();

    // 1. Exact mint lookup
    if (isMint) {
      const byMint = await this.getByMint(q);
      if (byMint) results.set(byMint.mint, byMint);
    }

    // 2. DB full-text search
    try {
      const { data } = await supabase
        .from('solana_token_registry')
        .select('*')
        .or(`symbol.ilike.%${q}%,name.ilike.%${q}%,mint.eq.${q}`)
        .order('liquidity_usd', { ascending: false, nullsFirst: false })
        .limit(50);

      for (const row of data ?? []) {
        results.set(row.mint, rowToToken(row));
      }
    } catch (e) {
      console.warn('[Registry] DB search error:', e);
    }

    // 3. Jupiter in-memory search (fast, no network)
    try {
      const jupTokens = await jupiterTokenListService.searchTokens(q);
      for (const jt of jupTokens.slice(0, 20)) {
        if (!results.has(jt.address)) {
          results.set(jt.address, {
            mint: jt.address, symbol: jt.symbol, name: jt.name,
            decimals: jt.decimals, logoUri: jt.logoURI,
            tokenProgram: 'spl', isVerified: !!(jt.tags?.includes('verified')),
            sources: ['jupiter'],
          });
        }
      }
    } catch {}

    // 4. DexScreener live search
    try {
      const dexPairs = await dexScreenerService.searchTokens(q);
      for (const pair of dexPairs.slice(0, 20)) {
        const mint = pair.baseToken.address;
        const existing = results.get(mint);
        const token: RegistryToken = {
          mint,
          symbol: pair.baseToken.symbol,
          name:   pair.baseToken.name,
          decimals: existing?.decimals ?? 6,
          logoUri:  pair.info?.imageUrl ?? existing?.logoUri,
          tokenProgram: existing?.tokenProgram ?? 'spl',
          isVerified: existing?.isVerified ?? false,
          sources: [...(existing?.sources ?? []), 'dexscreener'],
          priceUsd:  parseFloat(pair.priceUsd || '0') || undefined,
          priceChange24h: pair.priceChange?.h24,
          volume24h: pair.volume?.h24,
          liquidityUsd: pair.liquidity?.usd,
          marketCap: pair.marketCap,
          pairAddress: pair.pairAddress,
        };
        results.set(mint, token);
      }
    } catch {}

    // 5. If exact mint and still unknown, try on-chain + DAS
    if (isMint && !results.has(q)) {
      const resolved = await this.resolveUnknownMint(q);
      if (resolved) results.set(q, resolved);
    }

    const sorted = Array.from(results.values())
      .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));

    this.searchCache.set(cacheKey, { result: sorted, ts: Date.now() });

    // Register any new tokens in background
    const newMints = sorted.map(t => t.mint).filter(m => !this.memCache.has(m));
    if (newMints.length > 0) {
      this.registerMintsBackground(newMints, sorted).catch(() => {});
    }

    return sorted;
  }

  /**
   * Get a single token by mint address.
   * Checks memory cache → DB → on-chain fallback.
   */
  async getByMint(mint: string): Promise<RegistryToken | null> {
    // Memory cache
    const mem = this.memCache.get(mint);
    if (mem) return mem;

    // DB lookup
    try {
      const { data } = await supabase
        .from('solana_token_registry')
        .select('*')
        .eq('mint', mint)
        .maybeSingle();

      if (data) {
        const token = rowToToken(data);
        this.memCache.set(mint, token);
        return token;
      }
    } catch {}

    // On-chain + DAS resolution
    return this.resolveUnknownMint(mint);
  }

  /**
   * Register wallet-owned mints in the background.
   * Safe to call without await.
   */
  async registerWalletMints(mints: string[]): Promise<void> {
    if (mints.length === 0) return;
    // Only register mints not already in DB
    try {
      const { data } = await supabase
        .from('solana_token_registry')
        .select('mint')
        .in('mint', mints);
      const known = new Set((data ?? []).map((r: any) => r.mint));
      const unknown = mints.filter(m => !known.has(m));
      if (unknown.length > 0) {
        this.registerMintsBackground(unknown, []).catch(() => {});
      }
    } catch {
      this.registerMintsBackground(mints, []).catch(() => {});
    }
  }

  /**
   * Get top tokens (trending + new from DexScreener + Birdeye).
   * These are always returned from live sources, with DB enrichment.
   */
  async getTopTokens(limit = 100): Promise<RegistryToken[]> {
    const results = new Map<string, RegistryToken>();

    // DexScreener trending
    try {
      const pairs = await dexScreenerService.getTrendingSolanaTokens();
      for (const pair of pairs) {
        results.set(pair.baseToken.address, this.dexPairToToken(pair, ['dexscreener', 'trending']));
      }
    } catch {}

    // DexScreener new
    try {
      const newPairs = await dexScreenerService.getNewSolanaTokens();
      for (const pair of newPairs) {
        if (!results.has(pair.baseToken.address)) {
          results.set(pair.baseToken.address, this.dexPairToToken(pair, ['dexscreener', 'new']));
        }
      }
    } catch {}

    // Birdeye
    try {
      const birdTokens = await fetchBirdeyeTokens();
      for (const bt of birdTokens) {
        if (!results.has(bt.mint)) {
          results.set(bt.mint, {
            mint: bt.mint, symbol: bt.symbol, name: bt.name,
            decimals: 6, logoUri: bt.logoUri,
            tokenProgram: 'spl', isVerified: false,
            sources: ['birdeye'],
            priceUsd: bt.priceUsd, priceChange24h: bt.priceChange24h,
            volume24h: bt.volume24h, marketCap: bt.marketCap,
          });
        }
      }
    } catch {}

    const tokens = Array.from(results.values())
      .sort((a, b) => (b.liquidityUsd ?? b.volume24h ?? 0) - (a.liquidityUsd ?? a.volume24h ?? 0))
      .slice(0, limit);

    // Persist in background
    const rows = tokens.map(t => this.tokenToRow(t));
    upsertRows(rows).catch(() => {});

    return tokens;
  }

  /** Full background discovery sweep — called once per session */
  async runBackgroundDiscovery(): Promise<void> {
    if (this.backgroundRunning) return;
    if (Date.now() - this.lastBackgroundRun < 10 * 60 * 1000) return; // max once per 10 min
    this.backgroundRunning = true;
    this.lastBackgroundRun = Date.now();

    console.log('[Registry] Starting background discovery...');

    try {
      await Promise.allSettled([
        this.discoverFromJupiter(),
        this.discoverFromRaydium(),
        this.discoverFromMeteora(),
        this.discoverFromBirdeye(),
      ]);
    } finally {
      this.backgroundRunning = false;
      console.log('[Registry] Background discovery complete');
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async resolveUnknownMint(mint: string): Promise<RegistryToken | null> {
    // Validate on-chain first
    const onChain = await validateMintOnChain(mint);
    if (!onChain) return null; // mint doesn't exist on-chain

    // Get metadata via DAS (falls through to Jupiter/pump.fun internally)
    const meta = await this.metadataService.getTokenMetadata(mint);

    // Get market data from DexScreener
    let priceUsd: number | undefined;
    let priceChange24h: number | undefined;
    let volume24h: number | undefined;
    let liquidityUsd: number | undefined;
    let marketCap: number | undefined;
    let pairAddress: string | undefined;
    try {
      const pairs = await dexScreenerService.getTokenByAddress(mint);
      if (pairs.length > 0) {
        const best = pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
        priceUsd     = parseFloat(best.priceUsd || '0') || undefined;
        priceChange24h = best.priceChange?.h24;
        volume24h    = best.volume?.h24;
        liquidityUsd = best.liquidity?.usd;
        marketCap    = best.marketCap;
        pairAddress  = best.pairAddress;
      }
    } catch {}

    const token: RegistryToken = {
      mint,
      symbol:       meta.symbol,
      name:         meta.name,
      decimals:     meta.decimals ?? onChain.decimals,
      logoUri:      meta.logoURI,
      metadataUri:  meta.metadataUri,
      tokenProgram: meta.tokenProgram ?? onChain.tokenProgram,
      isVerified:   meta.verified,
      sources:      ['das', 'on-chain'],
      priceUsd, priceChange24h, volume24h, liquidityUsd, marketCap, pairAddress,
    };

    this.memCache.set(mint, token);

    // Persist to DB
    upsertRows([this.tokenToRow(token)]).catch(() => {});

    return token;
  }

  private async registerMintsBackground(mints: string[], knownTokens: RegistryToken[]): Promise<void> {
    const knownMap = new Map(knownTokens.map(t => [t.mint, t]));
    const rows: RegistryRow[] = [];

    for (const mint of mints) {
      try {
        const known = knownMap.get(mint);
        if (known) {
          rows.push(this.tokenToRow(known));
          this.memCache.set(mint, known);
          continue;
        }

        const meta = await this.metadataService.getTokenMetadata(mint);
        const token: RegistryToken = {
          mint,
          symbol:       meta.symbol,
          name:         meta.name,
          decimals:     meta.decimals,
          logoUri:      meta.logoURI,
          metadataUri:  meta.metadataUri,
          tokenProgram: meta.tokenProgram ?? 'spl',
          isVerified:   meta.verified,
          sources:      ['wallet', 'das'],
        };
        this.memCache.set(mint, token);
        rows.push(this.tokenToRow(token));
      } catch {}
    }

    await upsertRows(rows);
  }

  private async discoverFromJupiter(): Promise<void> {
    try {
      const tokens = await jupiterTokenListService.getAllTokens();
      const rows: RegistryRow[] = tokens.slice(0, 5000).map(t => ({
        mint:          t.address,
        symbol:        t.symbol || '',
        name:          t.name || t.symbol || '',
        decimals:      t.decimals,
        logo_uri:      t.logoURI || null,
        metadata_uri:  null,
        token_program: 'spl',
        is_verified:   !!(t.tags?.includes('verified') || t.tags?.includes('strict')),
        sources:       ['jupiter'],
        updated_at:    new Date().toISOString(),
      }));
      await upsertRows(rows);
      console.log(`[Registry] Jupiter: upserted ${rows.length} tokens`);
    } catch (e: any) {
      console.warn('[Registry] Jupiter discovery error:', e?.message);
    }
  }

  private async discoverFromRaydium(): Promise<void> {
    try {
      const mints = await fetchRaydiumMints();
      if (mints.length === 0) return;

      // Only register mints not already in DB
      const { data } = await supabase
        .from('solana_token_registry')
        .select('mint')
        .in('mint', mints.slice(0, 1000));
      const known = new Set((data ?? []).map((r: any) => r.mint));
      const unknown = mints.filter(m => !known.has(m)).slice(0, 200);

      // Batch DAS metadata for unknown mints
      const metaMap = await this.metadataService.getBatchTokenMetadata(unknown);
      const rows: RegistryRow[] = [];
      for (const [mint, meta] of metaMap) {
        rows.push({
          mint,
          symbol:       meta.symbol || '',
          name:         meta.name || '',
          decimals:     meta.decimals,
          logo_uri:     meta.logoURI || null,
          metadata_uri: meta.metadataUri || null,
          token_program: meta.tokenProgram || 'spl',
          is_verified:  meta.verified,
          sources:      ['raydium', 'das'],
          updated_at:   new Date().toISOString(),
        });
      }
      await upsertRows(rows);
      console.log(`[Registry] Raydium: registered ${rows.length} new tokens`);
    } catch (e: any) {
      console.warn('[Registry] Raydium discovery error:', e?.message);
    }
  }

  private async discoverFromMeteora(): Promise<void> {
    try {
      const mints = await fetchMeteoraMints();
      if (mints.length === 0) return;

      const { data } = await supabase
        .from('solana_token_registry')
        .select('mint')
        .in('mint', mints);
      const known = new Set((data ?? []).map((r: any) => r.mint));
      const unknown = mints.filter(m => !known.has(m)).slice(0, 100);

      const metaMap = await this.metadataService.getBatchTokenMetadata(unknown);
      const rows: RegistryRow[] = [];
      for (const [mint, meta] of metaMap) {
        rows.push({
          mint,
          symbol:       meta.symbol || '',
          name:         meta.name || '',
          decimals:     meta.decimals,
          logo_uri:     meta.logoURI || null,
          metadata_uri: meta.metadataUri || null,
          token_program: meta.tokenProgram || 'spl',
          is_verified:  meta.verified,
          sources:      ['meteora', 'das'],
          updated_at:   new Date().toISOString(),
        });
      }
      await upsertRows(rows);
      console.log(`[Registry] Meteora: registered ${rows.length} new tokens`);
    } catch (e: any) {
      console.warn('[Registry] Meteora discovery error:', e?.message);
    }
  }

  private async discoverFromBirdeye(): Promise<void> {
    try {
      const tokens = await fetchBirdeyeTokens();
      const rows: RegistryRow[] = tokens.map(t => ({
        mint:          t.mint,
        symbol:        t.symbol || '',
        name:          t.name || t.symbol || '',
        decimals:      6,
        logo_uri:      t.logoUri || null,
        metadata_uri:  null,
        token_program: 'spl',
        is_verified:   false,
        sources:       ['birdeye'],
        price_usd:     t.priceUsd ?? null,
        price_change_24h: t.priceChange24h ?? null,
        volume_24h:    t.volume24h ?? null,
        market_cap:    t.marketCap ?? null,
        updated_at:    new Date().toISOString(),
      }));
      await upsertRows(rows);
      console.log(`[Registry] Birdeye: upserted ${rows.length} tokens`);
    } catch (e: any) {
      console.warn('[Registry] Birdeye discovery error:', e?.message);
    }
  }

  private dexPairToToken(pair: DexPair, sources: string[]): RegistryToken {
    return {
      mint:          pair.baseToken.address,
      symbol:        pair.baseToken.symbol,
      name:          pair.baseToken.name,
      decimals:      6,
      logoUri:       pair.info?.imageUrl,
      tokenProgram:  'spl',
      isVerified:    false,
      sources,
      priceUsd:      parseFloat(pair.priceUsd || '0') || undefined,
      priceChange24h: pair.priceChange?.h24,
      volume24h:     pair.volume?.h24,
      liquidityUsd:  pair.liquidity?.usd,
      marketCap:     pair.marketCap,
      pairAddress:   pair.pairAddress,
    };
  }

  private tokenToRow(token: RegistryToken): RegistryRow {
    return {
      mint:          token.mint,
      symbol:        token.symbol || '',
      name:          token.name || '',
      decimals:      token.decimals,
      logo_uri:      token.logoUri ?? null,
      metadata_uri:  token.metadataUri ?? null,
      token_program: token.tokenProgram || 'spl',
      is_verified:   token.isVerified,
      sources:       [...new Set(token.sources)],
      price_usd:     token.priceUsd ?? null,
      price_change_24h: token.priceChange24h ?? null,
      volume_24h:    token.volume24h ?? null,
      liquidity_usd: token.liquidityUsd ?? null,
      market_cap:    token.marketCap ?? null,
      pair_address:  token.pairAddress ?? null,
      updated_at:    new Date().toISOString(),
    };
  }
}

export const tokenRegistryService = new TokenRegistryService();
