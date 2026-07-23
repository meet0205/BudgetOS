import { describe, it, expect } from 'vitest';
import { toMinor, minor } from './minor.js';
import { add, sum, subtract, negate, abs, scale, percentage, allocate } from './arithmetic.js';

describe('add / sum / subtract', () => {
  it('adds and subtracts in integer cents', () => {
    expect(add(toMinor('1.01'), toMinor('2.02'))).toBe(303);
    expect(sum([toMinor('0.10'), toMinor('0.20'), toMinor('0.03')])).toBe(33);
    expect(subtract(toMinor('5.00'), toMinor('1.99'))).toBe(301);
  });

  it('has no float drift (0.1 + 0.2 problem)', () => {
    expect(add(toMinor('0.1'), toMinor('0.2'))).toBe(30);
  });
});

describe('negate / abs', () => {
  it('flips and absolutes sign', () => {
    expect(negate(toMinor('5.25'))).toBe(-525);
    expect(abs(toMinor('-5.25'))).toBe(525);
  });
});

describe('scale', () => {
  it('multiplies by an integer quantity', () => {
    expect(scale(toMinor('2.50'), 3)).toBe(750);
  });
  it('rejects non-integer factors', () => {
    expect(() => scale(toMinor('2.50'), 1.5)).toThrow();
  });
});

describe('percentage', () => {
  it('computes a rounded percentage', () => {
    expect(percentage(toMinor('100.00'), 13)).toBe(1300); // 13% HST
    expect(percentage(toMinor('19.99'), 13)).toBe(260); // 259.87 -> 260
    expect(percentage(toMinor('10.00'), 5.05)).toBe(51); // 50.5 -> 51
  });
});

describe('allocate', () => {
  it('splits so parts always sum to the whole', () => {
    const parts = allocate(toMinor('10.00'), [1, 1, 1]);
    expect(parts).toEqual([334, 333, 333]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('respects weights', () => {
    const parts = allocate(toMinor('10.00'), [2, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parts[0]).toBeGreaterThan(parts[1]!);
  });

  it('handles negative amounts (refund split)', () => {
    const parts = allocate(minor(-1000), [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(-1000);
  });

  it('never gives a cent to a zero-weight part', () => {
    const parts = allocate(toMinor('10.00'), [1, 0, 1]);
    expect(parts[1]).toBe(0);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('rejects invalid weights', () => {
    expect(() => allocate(toMinor('1.00'), [])).toThrow();
    expect(() => allocate(toMinor('1.00'), [0, 0])).toThrow();
    expect(() => allocate(toMinor('1.00'), [1.5])).toThrow();
  });
});
