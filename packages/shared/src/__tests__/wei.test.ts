import { describe, it, expect } from 'vitest';
import { toWei, fromWei, weiToNumber, parseBigInt, WEI_PER_ETHER } from '../math/wei.js';

describe('WEI_PER_ETHER', () => {
  it('should be 10^18', () => {
    expect(WEI_PER_ETHER).toBe(10n ** 18n);
    expect(WEI_PER_ETHER.toString()).toBe('1000000000000000000');
  });
});

describe('toWei', () => {
  it('converts "0" to 0n', () => {
    expect(toWei('0')).toBe(0n);
  });

  it('converts "" to 0n', () => {
    expect(toWei('')).toBe(0n);
  });

  it('converts "1" to 10^18', () => {
    expect(toWei('1')).toBe(WEI_PER_ETHER);
  });

  it('converts "1.5" correctly', () => {
    expect(toWei('1.5')).toBe(1500000000000000000n);
  });

  it('converts "0.000000000000000001" (1 wei)', () => {
    expect(toWei('0.000000000000000001')).toBe(1n);
  });

  it('converts large amounts (10B GRT)', () => {
    const tenBillion = toWei('10000000000');
    expect(tenBillion).toBe(10000000000n * WEI_PER_ETHER);
  });

  it('handles negative values', () => {
    expect(toWei('-1')).toBe(-WEI_PER_ETHER);
  });

  it('truncates beyond 18 decimal places', () => {
    expect(toWei('1.1234567890123456789999')).toBe(1123456789012345678n);
  });
});

describe('fromWei', () => {
  it('converts 0n to "0"', () => {
    expect(fromWei(0n)).toBe('0');
  });

  it('converts 10^18 to "1"', () => {
    expect(fromWei(WEI_PER_ETHER)).toBe('1');
  });

  it('converts 1n to "0.000000000000000001"', () => {
    expect(fromWei(1n)).toBe('0.000000000000000001');
  });

  it('round-trips with toWei', () => {
    const values = ['0', '1', '1.5', '123456789.123456789', '10000000000'];
    for (const val of values) {
      expect(fromWei(toWei(val))).toBe(val);
    }
  });

  it('strips trailing zeros', () => {
    expect(fromWei(1500000000000000000n)).toBe('1.5');
  });

  it('handles negative values', () => {
    expect(fromWei(-WEI_PER_ETHER)).toBe('-1');
  });
});

describe('weiToNumber', () => {
  it('converts 10^18 to 1', () => {
    expect(weiToNumber(WEI_PER_ETHER)).toBe(1);
  });

  it('converts 0n to 0', () => {
    expect(weiToNumber(0n)).toBe(0);
  });

  it('converts 1.5 ether to 1.5', () => {
    expect(weiToNumber(1500000000000000000n)).toBe(1.5);
  });
});

describe('parseBigInt', () => {
  it('parses a string integer', () => {
    expect(parseBigInt('123456789')).toBe(123456789n);
  });

  it('handles null/undefined', () => {
    expect(parseBigInt(null)).toBe(0n);
    expect(parseBigInt(undefined)).toBe(0n);
  });

  it('handles empty string', () => {
    expect(parseBigInt('')).toBe(0n);
  });

  it('handles numeric input', () => {
    expect(parseBigInt(42)).toBe(42n);
  });

  it('truncates decimal portion', () => {
    expect(parseBigInt('123.456')).toBe(123n);
  });
});
