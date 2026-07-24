import { describe, it, expect } from 'vitest';
import { toMinor } from '../money/minor.js';
import { parseReceiptText } from './parse.js';

const WALMART = `WALMART SUPERCENTRE
1234 Main St, Halifax NS
Tel: 902-555-0100

Groceries        12.99
Milk 2%           4.49
Bread             3.29
SUBTOTAL         20.77
HST 15%           3.12
TOTAL            23.89

2026-07-18
Thank you for shopping`;

describe('parseReceiptText', () => {
  it('extracts merchant, total, and date', () => {
    const r = parseReceiptText(WALMART);
    expect(r.merchant).toBe('WALMART SUPERCENTRE');
    expect(r.totalMinor).toBe(toMinor('23.89'));   // TOTAL line, not SUBTOTAL
    expect(r.date).toBe('2026-07-18');
  });

  it('prefers the total line over the largest amount', () => {
    const r = parseReceiptText('SHOP\nItem A 99.00\nTOTAL 12.00');
    expect(r.totalMinor).toBe(toMinor('12.00'));
  });

  it('falls back to the largest amount when no total line', () => {
    const r = parseReceiptText('CORNER STORE\nA 4.00\nB 15.50\nC 2.25');
    expect(r.totalMinor).toBe(toMinor('15.50'));
  });

  it('parses month-name and numeric dates', () => {
    expect(parseReceiptText('X\nJul 24, 2026').date).toBe('2026-07-24');
    expect(parseReceiptText('X\n24/07/2026').date).toBe('2026-07-24'); // day>12 → dd/mm
    expect(parseReceiptText('X\n07/24/2026').date).toBe('2026-07-24'); // first≤12 → mm/dd
  });

  it('returns nulls when nothing is recognisable', () => {
    const r = parseReceiptText('■■■ ▨▨▨\n???');
    expect(r.merchant).toBeNull();
    expect(r.totalMinor).toBeNull();
    expect(r.date).toBeNull();
  });
});
