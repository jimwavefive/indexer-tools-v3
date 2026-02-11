import { describe, it, expect } from 'vitest';
import {
  maxAllo,
  calculateApr,
  calculateNewApr,
  calculateAllocationDailyRewards,
  calculateSubgraphDailyRewards,
  indexerCut,
  calculateAutoTargetApr,
  type NetworkData,
  type SelectedSubgraph,
  type FutureStakedEntry,
} from '../math/calc.js';
import { toWei } from '../math/wei.js';

/**
 * Realistic network data based on actual Arbitrum One values.
 * These are used as the baseline for all calc tests.
 */
const network: NetworkData = {
  totalTokensSignalled: toWei('3500000000'),    // ~3.5B GRT total signal
  issuancePerYear: toWei('300000000'),           // ~300M GRT/year issuance
  issuancePerBlock: toWei('52'),                 // ~52 GRT/block
};

describe('calculateApr', () => {
  it('returns 0 when staked tokens is 0', () => {
    expect(calculateApr(toWei('1000000'), 0n, network)).toBe(0);
  });

  it('returns 0 when signal is 0', () => {
    expect(calculateApr(0n, toWei('1000000'), network)).toBe(0);
  });

  it('calculates a reasonable APR', () => {
    // 10M signal / 3.5B total signal * 300M issuance / 5M staked * 100
    // = (10/3500) * 300/5 * 100
    // = 0.002857 * 60 * 100
    // ≈ 17.14%
    const apr = calculateApr(toWei('10000000'), toWei('5000000'), network);
    expect(apr).toBeCloseTo(17.14, 1);
  });

  it('APR increases with more signal', () => {
    const apr1 = calculateApr(toWei('5000000'), toWei('5000000'), network);
    const apr2 = calculateApr(toWei('10000000'), toWei('5000000'), network);
    expect(apr2).toBeGreaterThan(apr1);
    expect(apr2).toBeCloseTo(apr1 * 2, 0);
  });

  it('APR decreases with more staked tokens', () => {
    const apr1 = calculateApr(toWei('10000000'), toWei('5000000'), network);
    const apr2 = calculateApr(toWei('10000000'), toWei('10000000'), network);
    expect(apr2).toBeLessThan(apr1);
    expect(apr2).toBeCloseTo(apr1 / 2, 0);
  });
});

describe('calculateNewApr', () => {
  it('matches calculateApr when new allocation is 0', () => {
    const signal = toWei('10000000');
    const staked = toWei('5000000');
    expect(calculateNewApr(signal, staked, network, 0n)).toBe(
      calculateApr(signal, staked, network),
    );
  });

  it('decreases APR when adding allocation', () => {
    const signal = toWei('10000000');
    const staked = toWei('5000000');
    const baseLine = calculateApr(signal, staked, network);
    const withAlloc = calculateNewApr(signal, staked, network, toWei('1000000'));
    expect(withAlloc).toBeLessThan(baseLine);
  });
});

describe('maxAllo', () => {
  it('returns 0 for target APR of 0', () => {
    expect(maxAllo(0, toWei('10000000'), network, toWei('5000000'))).toBe(0);
  });

  it('calculates max allocation for a target APR', () => {
    // For a given APR, the max allo tells you how much more can be staked
    const targetApr = 10; // 10%
    const result = maxAllo(targetApr, toWei('10000000'), network, toWei('5000000'));
    expect(result).toBeGreaterThan(0);

    // Verify: if we allocate exactly the max, APR should be near the target
    const resultWei = toWei(result.toFixed(0));
    const actualApr = calculateNewApr(toWei('10000000'), toWei('5000000'), network, resultWei);
    expect(actualApr).toBeCloseTo(targetApr, 0);
  });

  it('returns 0 when staked tokens already exceed max for target APR', () => {
    const result = maxAllo(100, toWei('1000'), network, toWei('100000000'));
    expect(result).toBe(0);
  });
});

describe('calculateAllocationDailyRewards', () => {
  it('returns 0 when staked is 0', () => {
    expect(calculateAllocationDailyRewards(toWei('1000000'), 0n, toWei('500000'), network)).toBe(0);
  });

  it('returns a positive value for valid inputs', () => {
    const rewards = calculateAllocationDailyRewards(
      toWei('10000000'),  // signal
      toWei('5000000'),   // staked
      toWei('1000000'),   // allocated
      network,
    );
    expect(rewards).toBeGreaterThan(0);
  });

  it('rewards scale linearly with allocation proportion', () => {
    const rewards1 = calculateAllocationDailyRewards(
      toWei('10000000'), toWei('5000000'), toWei('1000000'), network,
    );
    const rewards2 = calculateAllocationDailyRewards(
      toWei('10000000'), toWei('5000000'), toWei('2000000'), network,
    );
    expect(rewards2 / rewards1).toBeCloseTo(2, 0);
  });
});

describe('calculateSubgraphDailyRewards', () => {
  it('returns 0 when staked is 0 and allocation is 0', () => {
    expect(calculateSubgraphDailyRewards(toWei('1000000'), 0n, network, 0n)).toBe(0);
  });

  it('returns a positive value for valid inputs', () => {
    const rewards = calculateSubgraphDailyRewards(
      toWei('10000000'), toWei('5000000'), network, toWei('1000000'),
    );
    expect(rewards).toBeGreaterThan(0);
  });
});

describe('indexerCut', () => {
  it('calculates correct cut at 100% (1000000 ppm)', () => {
    const rewards = toWei('100');
    expect(indexerCut(rewards, 1000000)).toBe(rewards);
  });

  it('calculates correct cut at 50% (500000 ppm)', () => {
    const rewards = toWei('100');
    expect(indexerCut(rewards, 500000)).toBe(toWei('50'));
  });

  it('calculates correct cut at 0%', () => {
    expect(indexerCut(toWei('100'), 0)).toBe(0n);
  });
});

describe('calculateAutoTargetApr', () => {
  it('returns 0 when no subgraphs are eligible', () => {
    expect(calculateAutoTargetApr([], [], network, 0n, 0n)).toBe(0);
  });

  it('returns 0 when all subgraphs are denied', () => {
    const subgraphs: SelectedSubgraph[] = [
      { deployment: { deniedAt: 1234, signalledTokens: toWei('1000000') } },
    ];
    const futureStaked: FutureStakedEntry[] = [
      { futureStakedTokens: toWei('1000000') },
    ];
    expect(calculateAutoTargetApr(subgraphs, futureStaked, network, toWei('100000'), 0n)).toBe(0);
  });

  it('calculates a positive APR for valid inputs', () => {
    const subgraphs: SelectedSubgraph[] = [
      { deployment: { deniedAt: null, signalledTokens: toWei('10000000') } },
      { deployment: { deniedAt: null, signalledTokens: toWei('5000000') } },
    ];
    const futureStaked: FutureStakedEntry[] = [
      { futureStakedTokens: toWei('2000000') },
      { futureStakedTokens: toWei('1000000') },
    ];

    const apr = calculateAutoTargetApr(
      subgraphs,
      futureStaked,
      network,
      toWei('5000000'),  // available
      toWei('1000000'),  // closing
    );
    expect(apr).toBeGreaterThan(0);
    expect(apr).toBeLessThan(100); // sanity check
  });

  it('removes subgraphs that cannot achieve the target APR', () => {
    // One subgraph with very low signal should be eliminated
    const subgraphs: SelectedSubgraph[] = [
      { deployment: { deniedAt: null, signalledTokens: toWei('10000000') } },
      { deployment: { deniedAt: null, signalledTokens: toWei('100') } }, // tiny signal
    ];
    const futureStaked: FutureStakedEntry[] = [
      { futureStakedTokens: toWei('2000000') },
      { futureStakedTokens: toWei('5000000') }, // huge staked relative to signal
    ];

    const apr = calculateAutoTargetApr(
      subgraphs,
      futureStaked,
      network,
      toWei('5000000'),
      0n,
    );
    expect(apr).toBeGreaterThan(0);
  });

  it('skips subgraphs with zero signal', () => {
    const subgraphs: SelectedSubgraph[] = [
      { deployment: { deniedAt: null, signalledTokens: 0n } },
      { deployment: { deniedAt: null, signalledTokens: toWei('10000000') } },
    ];
    const futureStaked: FutureStakedEntry[] = [
      { futureStakedTokens: 0n },
      { futureStakedTokens: toWei('1000000') },
    ];

    const apr = calculateAutoTargetApr(
      subgraphs,
      futureStaked,
      network,
      toWei('5000000'),
      0n,
    );
    expect(apr).toBeGreaterThan(0);
  });
});
