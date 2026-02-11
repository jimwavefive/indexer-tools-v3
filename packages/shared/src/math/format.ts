/**
 * Display formatting utilities.
 */

/**
 * Format GRT amount for display (e.g. "1,234.56 GRT" or "1.23M GRT").
 */
export function formatGrt(value: number, compact = false): string {
  if (compact && Math.abs(value) >= 1_000_000) {
    return (value / 1_000_000).toFixed(2) + 'M';
  }
  if (compact && Math.abs(value) >= 1_000) {
    return (value / 1_000).toFixed(1) + 'K';
  }
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Format APR percentage for display (e.g. "12.34%").
 */
export function formatApr(value: number): string {
  return value.toFixed(2) + '%';
}

/**
 * Format seconds into a human-readable duration (e.g. "3d 2h 15m").
 */
export function formatDuration(seconds: number): string {
  seconds = Math.floor(seconds);
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}
