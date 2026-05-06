import { jupiterTokenListService, JupiterToken } from './jupiter/tokenListService';
import { dexScreenerService } from './dexscreener/tokenDiscoveryService';
import { tokenRegistryService } from './tokenRegistryService';

const DTEST_MINT = '43m6D8gCagyJ4K6NjETr3wjSUUSAAwaFznKbCUECpump';

const DTEST_TOKEN: JupiterToken = {
  address: DTEST_MINT,
  chainId: 101,
  decimals: 6,
  name: 'Dawen Testnet',
  symbol: 'DTEST',
  logoURI: undefined,
  tags: ['community'],
};

const CACHE_MS = 5 * 60 * 1000;

class MergedTokenListService {
  private cache: JupiterToken[] = [];
  private cacheTime = 0;
  private fetchInProgress: Promise<JupiterToken[]> | null = null;

  async getAllTokens(): Promise<JupiterToken[]> {
    if (this.cache.length > 0 && Date.now() - this.cacheTime < CACHE_MS) {
      return this.cache;
    }
    if (this.fetchInProgress) return this.fetchInProgress;
    this.fetchInProgress = this.buildMergedList();
    try {
      return await this.fetchInProgress;
    } finally {
      this.fetchInProgress = null;
    }
  }

  private async buildMergedList(): Promise<JupiterToken[]> {
    const [jupiterResult, dexResult] = await Promise.allSettled([
      jupiterTokenListService.getAllTokens(),
      dexScreenerService.getTrendingSolanaTokens(),
    ]);

    const map = new Map<string, JupiterToken>();

    const jTokens = jupiterResult.status === 'fulfilled' ? jupiterResult.value : [];
    for (const t of jTokens) {
      map.set(t.address, t);
    }

    const dPairs = dexResult.status === 'fulfilled' ? dexResult.value : [];
    for (const pair of dPairs) {
      const { baseToken, info } = pair;
      if (!baseToken?.address) continue;
      const existing = map.get(baseToken.address);
      if (!existing) {
        map.set(baseToken.address, {
          address: baseToken.address,
          chainId: 101,
          decimals: 6,
          name: baseToken.name || baseToken.symbol,
          symbol: baseToken.symbol,
          logoURI: info?.imageUrl,
          tags: ['community'],
        });
      } else if (!existing.logoURI && info?.imageUrl) {
        map.set(baseToken.address, { ...existing, logoURI: info.imageUrl });
      }
    }

    // Always ensure DTEST is present
    map.set(DTEST_TOKEN.address, DTEST_TOKEN);

    const merged = Array.from(map.values());
    this.cache = merged;
    this.cacheTime = Date.now();
    return merged;
  }

  /**
   * Search tokens using the global registry first (broadest coverage),
   * falling back to in-memory Jupiter list.
   */
  async searchTokens(query: string): Promise<JupiterToken[]> {
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();

    // DTEST shortcut
    const dtestMatch = 'dtest'.includes(q) || 'dawen testnet'.includes(q) || DTEST_TOKEN.address.toLowerCase().includes(q);

    // Registry search (covers all sources: Jupiter + DexScreener + Birdeye + Raydium + Meteora + on-chain)
    try {
      const regResults = await tokenRegistryService.search(query);
      if (regResults.length > 0) {
        const asJupiter: JupiterToken[] = regResults.map(rt => ({
          address:  rt.mint,
          chainId:  101,
          decimals: rt.decimals,
          name:     rt.name,
          symbol:   rt.symbol,
          logoURI:  rt.logoUri,
          tags:     rt.isVerified ? ['verified'] : ['community'],
        }));

        const resultMap = new Map<string, JupiterToken>();
        if (dtestMatch) resultMap.set(DTEST_TOKEN.address, DTEST_TOKEN);
        for (const t of asJupiter) resultMap.set(t.address, t);

        return Array.from(resultMap.values()).slice(0, 50);
      }
    } catch {}

    // Fallback: in-memory Jupiter list
    const allTokens = await this.getAllTokens();
    const matches = allTokens.filter(
      t =>
        t.address !== DTEST_TOKEN.address &&
        (t.name.toLowerCase().includes(q) || t.symbol.toLowerCase().includes(q) || t.address.toLowerCase().includes(q))
    );
    const result = dtestMatch ? [DTEST_TOKEN, ...matches] : matches;
    return result.slice(0, 50);
  }

  async getTokenByAddress(address: string): Promise<JupiterToken | null> {
    if (address === DTEST_TOKEN.address) return DTEST_TOKEN;

    // Try in-memory first
    const allTokens = await this.getAllTokens();
    const inMemory = allTokens.find(t => t.address === address);
    if (inMemory) return inMemory;

    // Try registry (covers on-chain validation + DAS)
    try {
      const regToken = await tokenRegistryService.getByMint(address);
      if (regToken) {
        return {
          address:  regToken.mint,
          chainId:  101,
          decimals: regToken.decimals,
          name:     regToken.name,
          symbol:   regToken.symbol,
          logoURI:  regToken.logoUri,
          tags:     regToken.isVerified ? ['verified'] : ['community'],
        };
      }
    } catch {}

    return null;
  }

  async getVerifiedTokens(): Promise<JupiterToken[]> {
    const allTokens = await this.getAllTokens();
    return allTokens.filter(
      t =>
        t.address === DTEST_TOKEN.address ||
        t.tags?.includes('verified') ||
        t.tags?.includes('community')
    );
  }

  clearCache() {
    this.cache = [];
    this.cacheTime = 0;
    jupiterTokenListService.clearCache();
  }
}

export const mergedTokenListService = new MergedTokenListService();

export type { JupiterToken };
