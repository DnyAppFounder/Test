/**
 * Formats a token amount using K/M/B suffixes for readability.
 * Examples: 5555174.56 → "5.56M", 1234 → "1.23K", 999 → "999"
 */
export function formatTokenAmount(value: number): string {
  if (!isFinite(value) || isNaN(value)) return '0';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000) {
    return sign + (abs / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '') + 'B';
  }
  if (abs >= 1_000_000) {
    return sign + (abs / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M';
  }
  if (abs >= 1_000) {
    return sign + (abs / 1_000).toFixed(2).replace(/\.?0+$/, '') + 'K';
  }
  return sign + abs.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

/**
 * Formats a USD value using K/M/B suffixes.
 * Examples: 5555174.56 → "$5.56M", 1234 → "$1.23K"
 */
export function formatUsdAmount(value: number): string {
  if (!isFinite(value) || isNaN(value)) return '$0.00';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000) {
    return sign + '$' + (abs / 1_000_000_000).toFixed(2) + 'B';
  }
  if (abs >= 1_000_000) {
    return sign + '$' + (abs / 1_000_000).toFixed(2) + 'M';
  }
  if (abs >= 1_000) {
    return sign + '$' + (abs / 1_000).toFixed(2) + 'K';
  }
  return sign + '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
