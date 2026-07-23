/**
 * Merchant name normalisation. `normalized_name` is the key both merchant
 * autocomplete (03) and OCR merchant resolution (09) match on, so the rule has
 * to be identical everywhere: lowercase, punctuation stripped, whitespace
 * collapsed. Mirrors the Postgres `normalized_name` derivation.
 */
export function normalizeMerchantName(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD') // fold accents (café → cafe) before stripping marks
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ') // any run of non-alphanumerics → single space
    .trim();
}
