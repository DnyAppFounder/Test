import { jupiterTokenListService, JupiterToken } from './jupiter/tokenListService';
import { dexScreenerService } from './dexscreener/tokenDiscoveryService';

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

    // Always ensure DTEST is present with correct data
    map.set(DTEST_TOKEN.address, DTEST_TOKEN);

    const merged = Array.from(map.values());
    this.cache = merged;
    this.cacheTime = Date.now();
    return merged;
  }

  async searchTokens(query: string): Promise<JupiterToken[]> {
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();

    const dtestMatch =
      'dtest'.includes(q) ||
      'dawen testnet'.includes(q) ||
      DTEST_TOKEN.address.toLowerCase().includes(q);

    const allTokens = await this.getAllTokens();
    const matches = allTokens.filter(
      (t) =>
        t.address !== DTEST_TOKEN.address &&
        (t.name.toLowerCase().includes(q) ||
          t.symbol.toLowerCase().includes(q) ||
          t.address.toLowerCase().includes(q))
    );

    const result = dtestMatch ? [DTEST_TOKEN, ...matches] : matches;
    return result.slice(0, 50);
  }

  async getTokenByAddress(address: string): Promise<JupiterToken | null> {
    if (address === DTEST_TOKEN.address) return DTEST_TOKEN;
    const allTokens = await this.getAllTokens();
    return allTokens.find((t) => t.address === address) ?? null;
  }

  async getVerifiedTokens(): Promise<JupiterToken[]> {
    const allTokens = await this.getAllTokens();
    return allTokens.filter(
      (t) =>
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
