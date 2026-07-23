import { format as formatMinor, type Minor } from '@budgetos/core';

export const money = (m: Minor, currency = 'CAD') => formatMinor(m, currency);

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Today as an ISO date string (yyyy-mm-dd) for date inputs. */
export function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}
