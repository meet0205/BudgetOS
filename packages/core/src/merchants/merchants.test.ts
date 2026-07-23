import { describe, it, expect } from 'vitest';
import { normalizeMerchantName } from './normalize.js';
import { similarity, trigrams, rankBySimilarity } from './match.js';
import { InMemoryAdapter } from '../db/adapter.js';
import { MerchantRepository } from '../db/repositories/merchants.js';
import { fixedClock } from '../db/clock.js';

describe('normalizeMerchantName', () => {
  it('lowercases, strips punctuation, and collapses whitespace', () => {
    expect(normalizeMerchantName("Tim Hortons #1234")).toBe('tim hortons 1234');
    expect(normalizeMerchantName('  WAL-MART   SUPERCENTRE ')).toBe('wal mart supercentre');
  });

  it('folds accents so café matches cafe', () => {
    expect(normalizeMerchantName('Café Presse')).toBe('cafe presse');
  });

  it('returns empty string for punctuation-only input', () => {
    expect(normalizeMerchantName('###')).toBe('');
  });
});

describe('trigram similarity', () => {
  it('is 1 for identical strings', () => {
    expect(similarity('walmart', 'walmart')).toBe(1);
  });

  it('is 0 for wholly dissimilar strings', () => {
    expect(similarity('walmart', 'costco')).toBe(0);
  });

  it('ranks a near-typo above an unrelated name', () => {
    const typo = similarity('walmart', 'walmrt');
    const other = similarity('walmart', 'sobeys');
    expect(typo).toBeGreaterThan(other);
  });

  it('ignores case and punctuation via normalization', () => {
    expect(similarity('Tim Hortons', 'tim hortons')).toBe(1);
  });

  it('pads words the way pg_trgm does', () => {
    // "  a " has trigrams "  a" and " a " → 2 trigrams
    expect(trigrams('a')).toEqual(new Set(['  a', ' a ']));
  });
});

describe('rankBySimilarity', () => {
  it('orders best match first and drops below-threshold candidates', () => {
    const names = ['Walmart', 'Sobeys', 'Walmart Supercentre', 'Costco'];
    const ranked = rankBySimilarity('walmart', names, (n) => n);
    expect(ranked[0]?.item).toBe('Walmart');
    expect(ranked.map((r) => r.item)).not.toContain('Costco');
  });
});

describe('MerchantRepository', () => {
  const user = 'user-1';
  const clock = fixedClock('2026-07-23T12:00:00.000Z');
  let seq = 0;
  const newId = () => `m-${++seq}`;

  function repo() {
    seq = 0;
    return new MerchantRepository(new InMemoryAdapter(), { clock, newId });
  }

  it('creates a merchant on first save and bumps count on the second', async () => {
    const r = repo();
    const first = await r.resolveOnSave(user, 'Tim Hortons');
    expect(first?.transaction_count).toBe(1);

    const second = await r.resolveOnSave(user, 'tim   hortons'); // same normalized name
    expect(second?.id).toBe(first?.id);
    expect(second?.transaction_count).toBe(2);

    const all = await r.list(user);
    expect(all).toHaveLength(1);
  });

  it('does not create a merchant for a blank name', async () => {
    const r = repo();
    expect(await r.resolveOnSave(user, '   ')).toBeNull();
    expect(await r.list(user)).toHaveLength(0);
  });

  it('suggests by fuzzy match, most-used first', async () => {
    const r = repo();
    await r.resolveOnSave(user, 'Walmart');
    await r.resolveOnSave(user, 'Walmart'); // used twice
    await r.resolveOnSave(user, 'Sobeys');

    const suggestions = await r.suggest(user, 'walmrt');
    expect(suggestions[0]?.merchant.name).toBe('Walmart');
  });

  it('isolates merchants per user', async () => {
    const r = repo();
    await r.resolveOnSave(user, 'Walmart');
    expect(await r.list('user-2')).toHaveLength(0);
  });
});
