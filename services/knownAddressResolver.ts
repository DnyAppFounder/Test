import { SolanaConnectionService } from './solana/connectionService';

export type AddressType =
  | 'wallet'
  | 'protocol'
  | 'pool'
  | 'program'
  | 'bonding_curve'
  | 'creator'
  | 'treasury'
  | 'unknown';

export interface AddressLabel {
  displayName: string;
  shortAddress: string;
  type: AddressType;
  badgeLabel?: string;
  protocolName?: string;
  explorerUrl: string;
  isKnownProtocol: boolean;
}

// ─── Static known-address map ────────────────────────────────────────────────

const KNOWN: Record<string, { name: string; type: AddressType; badge: string }> = {
  // Pump.fun
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P': { name: 'Pump.fun', type: 'protocol', badge: 'Protocol' },
  'TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM': { name: 'Pump.fun', type: 'protocol', badge: 'Protocol' },
  'Ce6TQqeHB9R8okMgBMCRBKFABJnmVAGem5KyVq4k4Doh': { name: 'Pump.fun Fee', type: 'treasury', badge: 'Treasury' },

  // PumpSwap
  'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA': { name: 'PumpSwap', type: 'pool', badge: 'Pool' },
  'FfYek5e3U7iqLJLGiMbFmHqQejJRGnJJVVKdEjBiTB2n': { name: 'PumpSwap Fee', type: 'treasury', badge: 'Treasury' },

  // Raydium
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': { name: 'Raydium AMM', type: 'pool', badge: 'Pool' },
  '5quBtoiQqxF9Jv6KYKctB59NT3gtJD2Y65kdnB1Uev3h': { name: 'Raydium AMM v5', type: 'pool', badge: 'Pool' },
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK': { name: 'Raydium CLMM', type: 'pool', badge: 'Pool' },
  '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1': { name: 'Raydium', type: 'protocol', badge: 'Protocol' },
  '7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5': { name: 'Raydium', type: 'protocol', badge: 'Protocol' },
  'HWy1jotHpo6UqeQxx49dpYYdQB8wj9Qk9MdxwjLvDHB8': { name: 'Raydium', type: 'protocol', badge: 'Protocol' },

  // Meteora
  'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EkAW7vAV': { name: 'Meteora AMM', type: 'pool', badge: 'Pool' },
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo': { name: 'Meteora DLMM', type: 'pool', badge: 'Pool' },
  'M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K': { name: 'Meteora', type: 'protocol', badge: 'Protocol' },
  'FEESngU3neckdwib9X3KWqdL814oaVqPAHpkNFt6bBRo': { name: 'Meteora Fee', type: 'treasury', badge: 'Treasury' },

  // Jupiter
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': { name: 'Jupiter', type: 'protocol', badge: 'Protocol' },
  'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB': { name: 'Jupiter', type: 'protocol', badge: 'Protocol' },
  'JUP2jxvXaqu7NQY1GmNF4m1vodw12LVXYxbFL2uJvfo': { name: 'Jupiter', type: 'protocol', badge: 'Protocol' },

  // Orca
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc': { name: 'Orca Whirlpool', type: 'pool', badge: 'Pool' },
  '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP': { name: 'Orca', type: 'protocol', badge: 'Protocol' },

  // Lifinity
  'EewxydAPCCVuNEyrVN68PuSYdQ7wKn27V9Gjeoi8dy3S': { name: 'Lifinity AMM', type: 'pool', badge: 'Pool' },

  // Token programs
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': { name: 'Token Program', type: 'program', badge: 'Program' },
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb': { name: 'Token-2022', type: 'program', badge: 'Program' },
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bRS': { name: 'Assoc. Token Program', type: 'program', badge: 'Program' },

  // System
  '11111111111111111111111111111111': { name: 'System Program', type: 'program', badge: 'Program' },
  'So11111111111111111111111111111111111111112': { name: 'Wrapped SOL', type: 'protocol', badge: 'Token' },
  'ComputeBudget111111111111111111111111111111': { name: 'Compute Budget', type: 'program', badge: 'Program' },
  'SysvarC1ock11111111111111111111111111111111': { name: 'Sysvar Clock', type: 'program', badge: 'Program' },
  'SysvarRent111111111111111111111111111111111': { name: 'Sysvar Rent', type: 'program', badge: 'Program' },
};

// When an address's OWNER is one of these programs, label accordingly
const OWNER_PROGRAM_LABELS: Record<string, { name: string; badge: string; type: AddressType }> = {
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P': { name: 'Pump.fun · Bonding Curve', badge: 'Bonding Curve', type: 'bonding_curve' },
  'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA': { name: 'PumpSwap Pool', badge: 'Pool', type: 'pool' },
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': { name: 'Raydium Pool', badge: 'Pool', type: 'pool' },
  '5quBtoiQqxF9Jv6KYKctB59NT3gtJD2Y65kdnB1Uev3h': { name: 'Raydium Pool', badge: 'Pool', type: 'pool' },
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK': { name: 'Raydium Pool', badge: 'Pool', type: 'pool' },
  'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EkAW7vAV': { name: 'Meteora Pool', badge: 'Pool', type: 'pool' },
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo': { name: 'Meteora Pool', badge: 'Pool', type: 'pool' },
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc': { name: 'Orca Pool', badge: 'Pool', type: 'pool' },
  'EewxydAPCCVuNEyrVN68PuSYdQ7wKn27V9Gjeoi8dy3S': { name: 'Lifinity Pool', badge: 'Pool', type: 'pool' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function shorten(address: string): string {
  if (!address || address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function explorerUrl(address: string): string {
  return `https://solscan.io/account/${address}`;
}

// ─── Runtime owner-program cache ─────────────────────────────────────────────

const ownerProgramCache = new Map<string, string>(); // address → ownerProgram

// ─── Public API ───────────────────────────────────────────────────────────────

export function isKnownProtocol(address: string): boolean {
  return address in KNOWN;
}

/** Synchronously resolve an address label.
 *  If ownerProgram is passed (from a prior RPC lookup), uses it for PDA detection. */
export function resolveAddressLabel(address: string, ownerProgram?: string): AddressLabel {
  // 1. Static known map
  const known = KNOWN[address];
  if (known) {
    return {
      displayName: known.name,
      shortAddress: shorten(address),
      type: known.type,
      badgeLabel: known.badge,
      protocolName: known.name,
      explorerUrl: explorerUrl(address),
      isKnownProtocol: true,
    };
  }

  // 2. PDA: resolve by owner program
  const effectiveOwner = ownerProgram ?? ownerProgramCache.get(address);
  if (effectiveOwner) {
    const ownerLabel = OWNER_PROGRAM_LABELS[effectiveOwner];
    if (ownerLabel) {
      return {
        displayName: ownerLabel.name,
        shortAddress: shorten(address),
        type: ownerLabel.type,
        badgeLabel: ownerLabel.badge,
        protocolName: ownerLabel.name.split(' ')[0],
        explorerUrl: explorerUrl(address),
        isKnownProtocol: true,
      };
    }
  }

  // 3. Default: user wallet
  return {
    displayName: shorten(address),
    shortAddress: shorten(address),
    type: 'wallet',
    explorerUrl: explorerUrl(address),
    isKnownProtocol: false,
  };
}

/**
 * Batch resolve owner programs for unknown addresses.
 * Stores results in ownerProgramCache for future sync lookups.
 * Returns map of address → ownerProgram.
 */
export async function batchResolveOwnerPrograms(
  addresses: string[],
): Promise<Map<string, string>> {
  const unknown = addresses.filter(a => !KNOWN[a] && !ownerProgramCache.has(a));
  if (unknown.length === 0) {
    const result = new Map<string, string>();
    addresses.forEach(a => {
      const cached = ownerProgramCache.get(a);
      if (cached) result.set(a, cached);
    });
    return result;
  }

  try {
    const rpc = SolanaConnectionService.getInstance();
    const results = await rpc.batchRpcCall(
      unknown.map(addr => ({
        method: 'getAccountInfo',
        params: [addr, { encoding: 'base64', commitment: 'confirmed' }],
      }))
    );

    const ownerMap = new Map<string, string>();
    for (let i = 0; i < unknown.length; i++) {
      const info = results[i];
      const owner: string = info?.owner ?? '';
      if (owner) {
        ownerProgramCache.set(unknown[i], owner);
        ownerMap.set(unknown[i], owner);
      }
    }
    // Also include cached ones for existing addresses
    addresses.forEach(a => {
      const cached = ownerProgramCache.get(a);
      if (cached && !ownerMap.has(a)) ownerMap.set(a, cached);
    });
    return ownerMap;
  } catch {
    return new Map();
  }
}

/**
 * Detect which protocol is involved in a transaction from its account keys.
 * Returns the most prominent protocol name found, or ''.
 */
export function detectTxProtocol(accountKeys: string[]): string {
  // Priority order: Pump.fun > PumpSwap > Raydium > Meteora > Jupiter > Orca
  const priority = [
    '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
    'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
    '5quBtoiQqxF9Jv6KYKctB59NT3gtJD2Y65kdnB1Uev3h',
    'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
    'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EkAW7vAV',
    'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',
    'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
  ];

  const keySet = new Set(accountKeys);
  for (const prog of priority) {
    if (keySet.has(prog)) {
      const label = KNOWN[prog];
      return label ? label.name.split(' ')[0] : '';
    }
  }
  return '';
}
