/**
 * Trigram similarity, matching Postgres `pg_trgm` closely enough that local
 * autocomplete ranks the same way the server would. Both this and the DB use
 * space-padded trigrams and Jaccard-style overlap, so a merchant that ranks
 * first here ranks first after sync.
 *
 * pg_trgm splits on word boundaries, pads each word, and treats the trigram set
 * as a set (duplicates collapse). similarity = |A ∩ B| / |A ∪ B|.
 */
import { normalizeMerchantName } from './normalize.js';

/** The set of space-padded trigrams pg_trgm would produce for a string. */
export function trigrams(input: string): Set<string> {
  const words = normalizeMerchantName(input).split(' ').filter(Boolean);
  const grams = new Set<string>();
  for (const word of words) {
    // pg_trgm pads with two leading and one trailing space: "  w..d ".
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i++) {
      grams.add(padded.slice(i, i + 3));
    }
  }
  return grams;
}

/** Jaccard similarity of two trigram sets, in [0, 1]. */
export function similarity(a: string, b: string): number {
  const ga = trigrams(a);
  const gb = trigrams(b);
  if (ga.size === 0 && gb.size === 0) return 1;
  if (ga.size === 0 || gb.size === 0) return 0;

  let intersection = 0;
  for (const g of ga) if (gb.has(g)) intersection++;
  const union = ga.size + gb.size - intersection;
  return intersection / union;
}

export interface RankedMatch<T> {
  item: T;
  score: number;
}

/**
 * Rank candidates by similarity to a query, best first, dropping anything below
 * `threshold`. pg_trgm's default similarity threshold is 0.3; we mirror it.
 */
export function rankBySimilarity<T>(
  query: string,
  candidates: readonly T[],
  keyOf: (c: T) => string,
  threshold = 0.3,
): RankedMatch<T>[] {
  return candidates
    .map((item) => ({ item, score: similarity(query, keyOf(item)) }))
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score);
}
