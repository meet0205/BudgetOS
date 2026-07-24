import type { BillState } from '../db/types.js';

/**
 * Derive a bill instance's state from its due date and whether it's been paid.
 *   paid       → a matching transaction is linked
 *   overdue    → past its due date and unpaid
 *   due        → within `dateToleranceDays` of today and unpaid
 *   upcoming   → further out
 */
export function billState(args: {
  dueDate: string;
  todayISO: string;
  paid: boolean;
  dateToleranceDays?: number;
}): BillState {
  const { dueDate, todayISO, paid, dateToleranceDays = 5 } = args;
  if (paid) return 'paid';
  const due = dueDate.slice(0, 10);
  const today = todayISO.slice(0, 10);
  if (due < today) return 'overdue';
  const MS_DAY = 86_400_000;
  const [dy, dm, dd] = due.split('-').map((n) => parseInt(n, 10)) as [number, number, number];
  const [ty, tm, td] = today.split('-').map((n) => parseInt(n, 10)) as [number, number, number];
  const daysAway = Math.round((Date.UTC(dy, dm - 1, dd) - Date.UTC(ty, tm - 1, td)) / MS_DAY);
  return daysAway <= dateToleranceDays ? 'due' : 'upcoming';
}
