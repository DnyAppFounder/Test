import { SolanaConnectionService } from '@/services/solana/connectionService';
import { detectTxProtocol, resolveAddressLabel } from '@/services/knownAddressResolver';

export interface TokenTrade {
  id: string;
  type: 'buy' | 'sell' | 'transfer' | 'liquidity' | 'mint' | 'burn';
  walletAddress: string;
  walletLabel: string;      // resolved display name (protocol or shortened wallet)
  isProtocol: boolean;      // true when walletAddress is a known program/pool
  protocolSource: string;   // e.g. "Pump.fun", "Raydium", "" for unknown
  amount: number;           // USD value
  tokenAmount: number;      // token UI units
  solAmount: number;        // SOL change (positive = received, negative = sent)
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
  private readonly CACHE_DURATION = 20_000;

  async getTokenTrades(
    tokenMint: string,
    pairAddress: string | undefined,
    tokenPrice: number,
    tokenDecimals: number,
    limit = 30,
  ): Promise<TokenTrade[]> {
    const key = `${tokenMint}:${pairAddress || ''}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.data;
    }

    try {
      const rpc = SolanaConnectionService.getInstance();
      const queryAddress = pairAddress || tokenMint;

      const sigsResult = await rpc.rpcCall('getSignaturesForAddress', [
        queryAddress,
        { limit, commitment: 'confirmed' },
      ]);

      const sigs: Array<{ signature: string; blockTime: number | null; err: any }> =
        Array.isArray(sigsResult) ? sigsResult : [];

      const validSigs = sigs.filter(s => !s.err && s.signature && s.blockTime != null);
      if (validSigs.length === 0) return [];

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

        const preTokenBal: any[] = tx.meta?.preTokenBalances ?? [];
        const postTokenBal: any[] = tx.meta?.postTokenBalances ?? [];
        const preSolBal: number[] = tx.meta?.preBalances ?? [];
        const postSolBal: number[] = tx.meta?.postBalances ?? [];

        // Get account keys for protocol detection and SOL delta mapping
        const rawKeys: any[] = tx.transaction?.message?.accountKeys ?? [];
        const accountKeys: string[] = rawKeys.map((k: any) =>
          typeof k === 'string' ? k : (k.pubkey ?? '')
        );

        const protocol = detectTxProtocol(accountKeys);

        const changes = computeTokenChanges(tokenMint, preTokenBal, postTokenBal);
        if (changes.length === 0) continue;

        for (const change of changes) {
          if (Math.abs(change.delta) < 0.000001) continue;

          // SOL delta for this owner's wallet (if their key appears in account keys)
          const ownerIdx = accountKeys.indexOf(change.owner);
          const preSol = ownerIdx >= 0 ? (preSolBal[ownerIdx] ?? 0) : 0;
          const postSol = ownerIdx >= 0 ? (postSolBal[ownerIdx] ?? 0) : 0;
          const solDelta = (postSol - preSol) / 1e9;

          const type = classifyType(change.delta, solDelta);
          const tokenAmount = Math.abs(change.delta);
          const usdAmount = tokenAmount * tokenPrice;

          const label = resolveAddressLabel(change.owner);

          trades.push({
            id: `${sig.signature}-${change.owner.slice(0, 8)}`,
            type,
            walletAddress: change.owner,
            walletLabel: label.displayName,
            isProtocol: label.isKnownProtocol,
            protocolSource: protocol,
            amount: usdAmount,
            tokenAmount,
            solAmount: solDelta,
            priceUsd: tokenPrice,
            timestamp: blockTime * 1000,
            txSignature: sig.signature,
          });
        }
      }

      trades.sort((a, b) => b.timestamp - a.timestamp);
      const result = trades.slice(0, 50);
      this.cache.set(key, { data: result, timestamp: Date.now() });
      console.log(`[TokenActivity] ${tokenMint.slice(0, 8)} — ${result.length} events`);
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

  formatSol(sol: number): string {
    const abs = Math.abs(sol);
    if (abs < 0.0001) return '';
    if (abs >= 1000) return `${abs.toFixed(0)} SOL`;
    if (abs >= 1) return `${abs.toFixed(3)} SOL`;
    return `${abs.toFixed(5)} SOL`;
  }

  formatTimeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  }
}

function classifyType(
  tokenDelta: number,
  solDelta: number,
): TokenTrade['type'] {
  const solThreshold = 0.00001; // ignore dust SOL changes

  const tokenIn = tokenDelta > 0;
  const tokenOut = tokenDelta < 0;
  const solIn = solDelta > solThreshold;
  const solOut = solDelta < -solThreshold;

  if (tokenIn && solOut) return 'buy';
  if (tokenOut && solIn) return 'sell';

  // Mint: token supply increases, no counterparty SOL
  if (tokenIn && !solOut && !solIn) return 'transfer';
  if (tokenOut && !solIn && !solOut) return 'transfer';

  // Fallback
  return tokenDelta > 0 ? 'buy' : 'sell';
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

  if (changes.length <= 1) return changes;
  // Keep the side with the largest absolute delta (the primary trader)
  changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return [changes[0]];
}

export const tokenActivityService = new TokenActivityService();
