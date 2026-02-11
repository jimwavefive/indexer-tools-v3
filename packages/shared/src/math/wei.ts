/**
 * Wei/Ether conversion utilities using native BigInt.
 *
 * All token amounts in The Graph protocol are stored as wei (10^18).
 * We use BigInt for lossless integer arithmetic and convert to Number
 * only for display or ratio calculations where 53-bit precision suffices.
 */

export const WEI_PER_ETHER = 10n ** 18n;

/**
 * Convert a decimal string (e.g. "1.5") to wei as bigint.
 * Handles up to 18 decimal places.
 */
export function toWei(value: string): bigint {
  if (!value || value === '0') return 0n;

  const negative = value.startsWith('-');
  const abs = negative ? value.slice(1) : value;

  const [whole, frac = ''] = abs.split('.');
  const paddedFrac = frac.padEnd(18, '0').slice(0, 18);
  const result = BigInt(whole || '0') * WEI_PER_ETHER + BigInt(paddedFrac);

  return negative ? -result : result;
}

/**
 * Convert a wei bigint to a decimal string with full precision.
 */
export function fromWei(value: bigint): string {
  if (value === 0n) return '0';

  const negative = value < 0n;
  const abs = negative ? -value : value;

  const whole = abs / WEI_PER_ETHER;
  const remainder = abs % WEI_PER_ETHER;

  if (remainder === 0n) {
    return negative ? `-${whole}` : `${whole}`;
  }

  const fracStr = remainder.toString().padStart(18, '0').replace(/0+$/, '');
  const result = `${whole}.${fracStr}`;
  return negative ? `-${result}` : result;
}

/**
 * Convert a wei bigint to a JavaScript number (lossy for very large values).
 * Suitable for APR calculations, proportions, and display formatting.
 */
export function weiToNumber(value: bigint): number {
  return Number(value) / 1e18;
}

/**
 * Parse a GraphQL string value (which comes as decimal string) to bigint.
 * GraphQL responses return token amounts as strings like "123456789000000000000".
 */
export function parseBigInt(value: string | number | undefined | null): bigint {
  if (value == null || value === '') return 0n;
  // Remove any decimal portion (GraphQL sometimes returns "0" or integer strings)
  const str = String(value).split('.')[0];
  return BigInt(str);
}
