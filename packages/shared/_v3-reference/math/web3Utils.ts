import BigNumber from 'bignumber.js';

const WEI_PER_ETHER = new BigNumber(10).pow(18);

/**
 * Convert a value in wei to ether.
 */
export function fromWei(value: string | number | BigNumber): string {
  return new BigNumber(value).dividedBy(WEI_PER_ETHER).toFixed();
}

/**
 * Convert a value in ether to wei.
 */
export function toWei(value: string | number | BigNumber): string {
  return new BigNumber(value).multipliedBy(WEI_PER_ETHER).toFixed(0);
}

/**
 * Convert a value to a BigNumber string (replaces Web3.utils.toBN).
 */
export function toBN(value: string | number | BigNumber): string {
  return new BigNumber(value).toFixed(0);
}

/**
 * Convert ethers.js BigInt (uint256) to BigNumber.js instance.
 */
export function bigIntToBigNumber(value: bigint): BigNumber {
  return new BigNumber(value.toString());
}

export { WEI_PER_ETHER };
