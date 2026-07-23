import { describe, it, expect } from 'vitest';
import { minor, toMinor, toMajorNumber, format, ZERO } from './minor.js';

describe('toMinor', () => {
  it('parses whole and fractional amounts', () => {
    expect(toMinor('0')).toBe(0);
    expect(toMinor('1')).toBe(100);
    expect(toMinor('1.5')).toBe(150);
    expect(toMinor('1.05')).toBe(105);
    expect(toMinor('1234.56')).toBe(123456);
  });

  it('handles negatives correctly (PRD snippet got this wrong)', () => {
    expect(toMinor('-5.25')).toBe(-525);
    expect(toMinor('-0.01')).toBe(-1);
    expect(toMinor('+3.00')).toBe(300);
  });

  it('rounds half-up at the third decimal instead of truncating', () => {
    expect(toMinor('0.999')).toBe(100);
    expect(toMinor('1.005')).toBe(101);
    expect(toMinor('1.004')).toBe(100);
    expect(toMinor('2.994')).toBe(299);
  });

  it('tolerates currency symbols, thousands separators, whitespace', () => {
    expect(toMinor('$1,234.56')).toBe(123456);
    expect(toMinor('  42 ')).toBe(4200);
    expect(toMinor('.5')).toBe(50);
  });

  it('rejects garbage rather than silently coercing', () => {
    expect(() => toMinor('')).toThrow();
    expect(() => toMinor('abc')).toThrow();
    expect(() => toMinor('1.2.3')).toThrow();
    expect(() => toMinor('--1')).toThrow();
  });
});

describe('minor', () => {
  it('rejects non-integer cents', () => {
    expect(() => minor(1.5)).toThrow();
    expect(minor(150)).toBe(150);
    expect(ZERO).toBe(0);
  });
});

describe('format', () => {
  it('produces $1,234.56 for CAD (acceptance criterion)', () => {
    // Intl may use a non-breaking space; normalise before comparing.
    expect(format(toMinor('1234.56')).replace(/ /g, ' ')).toBe('$1,234.56');
  });

  it('formats negatives and zero', () => {
    expect(format(toMinor('-5.25')).replace(/ /g, ' ')).toBe('-$5.25');
    expect(format(ZERO).replace(/ /g, ' ')).toBe('$0.00');
  });
});

describe('toMajorNumber', () => {
  it('converts cents back to a major number at the display boundary', () => {
    expect(toMajorNumber(toMinor('1234.56'))).toBe(1234.56);
  });
});
