import type { Minor } from '../money/minor.js';
import { toMinor } from '../money/minor.js';

export interface ParsedReceipt {
  merchant: string | null;
  date: string | null;   // yyyy-mm-dd
  totalMinor: Minor | null;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** All money amounts in a line, as Minor. */
function amountsIn(line: string): Minor[] {
  const out: Minor[] = [];
  const re = /(?:\$\s*)?(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    try { out.push(toMinor(`${m[1]}.${m[2]}`)); } catch { /* skip */ }
  }
  return out;
}

function pad(n: number): string { return String(n).padStart(2, '0'); }

/** Find a date anywhere in the text and normalise to yyyy-mm-dd. */
function findDate(text: string): string | null {
  // ISO: 2026-07-24
  let m = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/.exec(text);
  if (m) return `${m[1]}-${pad(+m[2]!)}-${pad(+m[3]!)}`;
  // Numeric: 24/07/2026 or 07/24/26 — assume mm/dd when first ≤12, else dd/mm.
  m = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/.exec(text);
  if (m) {
    let [a, b] = [+m[1]!, +m[2]!];
    let mo: number, day: number;
    if (a > 12) { day = a; mo = b; } else { mo = a; day = b; }
    let y = +m[3]!; if (y < 100) y += 2000;
    if (mo >= 1 && mo <= 12 && day >= 1 && day <= 31) return `${y}-${pad(mo)}-${pad(day)}`;
  }
  // Month name: Jul 24, 2026 / 24 Jul 2026
  m = /\b([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(20\d{2})\b/.exec(text);
  if (m && MONTHS[m[1]!.slice(0, 3).toLowerCase()]) {
    return `${m[3]}-${pad(MONTHS[m[1]!.slice(0, 3).toLowerCase()]!)}-${pad(+m[2]!)}`;
  }
  m = /\b(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(20\d{2})\b/.exec(text);
  if (m && MONTHS[m[2]!.slice(0, 3).toLowerCase()]) {
    return `${m[3]}-${pad(MONTHS[m[2]!.slice(0, 3).toLowerCase()]!)}-${pad(+m[1]!)}`;
  }
  return null;
}

/**
 * Parse raw OCR text from a receipt into merchant, date, and total. Heuristics:
 *   - merchant: the first line that's mostly letters (the store name at the top)
 *   - total:   the amount on a line mentioning "total" (preferring "grand"/"total"
 *              over "subtotal"); else the largest amount on the receipt
 *   - date:    the first recognisable date in any common format
 * Returns nulls for anything not found — the UI shows these for the user to fix.
 */
export function parseReceiptText(text: string): ParsedReceipt {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Merchant: first line that is mostly alphabetic and not a number/address.
  let merchant: string | null = null;
  for (const line of lines.slice(0, 6)) {
    const letters = (line.match(/[A-Za-z]/g) ?? []).length;
    const digits = (line.match(/\d/g) ?? []).length;
    if (letters >= 3 && letters >= digits && !/receipt|invoice|tel|phone|www\.|http/i.test(line)) {
      merchant = line.replace(/\s{2,}/g, ' ');
      break;
    }
  }

  // Total: prefer a "total" line (but not "subtotal"); else the max amount.
  let totalMinor: Minor | null = null;
  const totalLines = lines.filter((l) => /total/i.test(l) && !/sub[\s-]?total/i.test(l));
  for (const l of totalLines) {
    const amts = amountsIn(l);
    if (amts.length) totalMinor = amts[amts.length - 1]!; // amount usually at line end
  }
  if (totalMinor === null) {
    const all = lines.flatMap(amountsIn);
    if (all.length) totalMinor = all.reduce((mx, a) => (a > mx ? a : mx), all[0]!);
  }

  return { merchant, date: findDate(text), totalMinor };
}
