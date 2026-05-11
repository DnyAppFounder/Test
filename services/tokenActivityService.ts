import { SolanaConnectionService } from '@/services/solana/connectionService';

export interface TokenTrade {
  id: string;
  type: 'buy' | 'sell' | 'transfer' | 'liquidity';
  walletAddress: string;
  amount: number;
  tokenAmount: number;
  priceUsd: number;
  timestamp: number;
  txSignature: string;
}

interface CacheEntry {
  data: TokenTrade[];
  timestamp: number;
}

class TokenActivityService {
  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_DURATION = 20 * 1000;

  async getTokenTrades(
    tokenMint: string,
    pairAddress: string | undefined,
    tokenPrice: number,
    tokenDecimals: number,
    limit = 25,
  ): Promise<TokenTrade[]> {
    const key = `${tokenMint}:${pairAddress || ''}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }

    try {
      const rpc = SolanaConnectionService.getInstance();
      const queryAddress = pairAddress || tokenMint;

      // Step 1: get recent confirmed signatures
      const sigsResult = await rpc.rpcCall('getSignaturesForAddress', [
        queryAddress,
        { limit, commitment: 'confirmed' },
      ]);

      const sigs: Array<{ signature: string; blockTime: number | null; err: any }> =
        Array.isArray(sigsResult) ? sigsResult : [];

      const validSigs = sigs.filter(s => !s.err && s.signature && s.blockTime != null);
      if (validSigs.length === 0) return [];

      // Step 2: batch fetch full transactions
      const batchReqs = validSigs.map(s => ({
        method: 'getTransaction',
        params: [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
      }));

      const txResults = await rpc.batchRpcCall(batchReqs);

      const trades: TokenTrade[] = [];

      for (let i = 0; i < txResults.length; i++) {
        const tx = txResults[i];
        const sig = validSigs[i];
        if (!tx || !sig) continue;

        const blockTime = tx.blockTime ?? sig.blockTime;
        if (!blockTime) continue;

        const preBalances: any[] = tx.meta?.preTokenBalances ?? [];
        const postBalances: any[] = tx.meta?.postTokenBalances ?? [];

        // Find token balance changes for our mint
        const changes = computeTokenChanges(tokenMint, preBalances, postBalances);
        if (changes.length === 0) continue;

        for (const change of changes) {
          if (Math.abs(change.delta) < 0.000001) continue;

          const isBuy = change.delta > 0;
          const isSell = change.delta < 0;
          const type: TokenTrade['type'] = isBuy ? 'buy' : isSell ? 'sell' : 'transfer';
          const tokenAmount = Math.abs(change.delta);
          const usdAmount = tokenAmount * tokenPrice;

          trades.push({
            id: `${sig.signature}-${change.owner.slice(0, 8)}`,
            type,
            walletAddress: change.owner,
            amount: usdAmount,
            tokenAmount,
            priceUsd: tokenPrice,
            timestamp: blockTime * 1000,
            txSignature: sig.signature,
          });
        }
      }

      trades.sort((a, b) => b.timestamp - a.timestamp);

      const result = trades.slice(0, 50);
      this.cache.set(key, { data: result, timestamp: Date.now() });
      return result;
    } catch (e) {
      console.warn('[TokenActivityService] Error fetching trades:', e);
      return [];
    }
  }

  invalidate(tokenMint: string, pairAddress?: string) {
    const key = `${tokenMint}:${pairAddress || ''}`;
    this.cache.delete(key);
  }

  formatWalletAddress(address: string): string {
    if (address.length < 12) return address;
    return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
  }

  formatUsd(amount: number): string {
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
    if (amount >= 1_000) return `$${(amount / 1_000).toFixed(2)}K`;
    if (amount >= 1) return `$${amount.toFixed(2)}`;
    return `$${amount.toFixed(4)}`;
  }

  formatTokenAmount(amount: number): string {
    if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(2)}B`;
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(2)}K`;
    if (amount >= 1) return amount.toFixed(2);
    return amount.toPrecision(4);
  }

  formatTimeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  }
}

interface BalanceChange {
  owner: string;
  delta: number;
}

function computeTokenChanges(
  mint: string,
  pre: any[],
  post: any[],
): BalanceChange[] {
  const preMap = new Map<number, { owner: string; amount: number }>();
  for (const b of pre) {
    if (b.mint === mint) {
      preMap.set(b.accountIndex, {
        owner: b.owner ?? '',
        amount: b.uiTokenAmount?.uiAmount ?? 0,
      });
    }
  }

  const postMap = new Map<number, { owner: string; amount: number }>();
  for (const b of post) {
    if (b.mint === mint) {
      postMap.set(b.accountIndex, {
        owner: b.owner ?? '',
        amount: b.uiTokenAmount?.uiAmount ?? 0,
      });
    }
  }

  const allIndexes = new Set([...preMap.keys(), ...postMap.keys()]);
  const changes: BalanceChange[] = [];

  for (const idx of allIndexes) {
    const before = preMap.get(idx)?.amount ?? 0;
    const after = postMap.get(idx)?.amount ?? 0;
    const owner = postMap.get(idx)?.owner || preMap.get(idx)?.owner || '';
    const delta = after - before;
    if (Math.abs(delta) > 0.000001 && owner) {
      changes.push({ owner, delta });
    }
  }

  // For each tx, keep only the largest change (the primary trader)
  if (changes.length <= 1) return changes;
  changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return [changes[0]];
}

export const tokenActivityService = new TokenActivityService();
