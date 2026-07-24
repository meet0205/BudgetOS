import { format as formatMinor, type Minor } from '@budgetos/core';

export const money = (m: Minor, currency = 'CAD') => formatMinor(m, currency);

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Format a date-only string ("yyyy-mm-dd") without a timezone shift. Parsing
 * such a string with `new Date()` treats it as UTC midnight, which renders as
 * the previous day in negative-offset zones (e.g. Atlantic). Anchoring at noon
 * local time keeps the calendar day correct everywhere.
 */
export function formatDateOnly(ymd: string): string {
  return new Date(ymd + 'T12:00:00').toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

/** Today as an ISO date string (yyyy-mm-dd) for date inputs. */
export function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}
