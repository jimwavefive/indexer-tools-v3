import BigNumber from 'bignumber.js';

const WEI_PER_ETHER = new BigNumber(10).pow(18);

/**
 * Convert a value in wei to ether.
 * Equivalent to Web3.utils.fromWei(value, 'ether').
 */
export function fromWei(value) {
  return new BigNumber(value).dividedBy(WEI_PER_ETHER).toFixed();
}

/**
 * Convert a value in ether to wei.
 * Equivalent to Web3.utils.toWei(value, 'ether').
 */
export function toWei(value) {
  return new BigNumber(value).multipliedBy(WEI_PER_ETHER).toFixed(0);
}

/**
 * Convert a value to a BigNumber string (replaces Web3.utils.toBN).
 * Web3.utils.toBN returns a BN instance; when passed to fromWei it
 * just needs to be a numeric string, which BigNumber handles.
 */
export function toBN(value) {
  return new BigNumber(value).toFixed(0);
}
