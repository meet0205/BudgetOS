import type { Adapter } from '../adapter.js';
import type { RecurringBill, BillFrequency } from '../types.js';
import { type Clock, systemClock } from '../clock.js';
import { newId as defaultNewId, type UUID } from '../ids.js';
import type { Minor } from '../../money/minor.js';

export const RECURRING_BILLS = 'recurring_bills';

export interface NewBillInput {
  name: string;
  expected_minor: Minor;
  frequency: BillFrequency;
  starts_on: string;
  interval?: number;
  day_of_month?: number | null;
  day_of_week?: number | null;
  ends_on?: string | null;
  merchant_id?: UUID | null;
  category_id?: UUID | null;
  account_id?: UUID | null;
  currency_code?: string;
  amount_tolerance_percent?: number;
  date_tolerance_days?: number;
}

export class BillRepository {
  private readonly newId: () => UUID;
  private readonly clock: Clock;

  constructor(
    private readonly adapter: Adapter,
    options: { clock?: Clock; newId?: () => UUID } = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.newId = options.newId ?? defaultNewId;
  }

  async create(userId: UUID, input: NewBillInput): Promise<RecurringBill> {
    const bill: RecurringBill = {
      id: this.newId(),
      user_id: userId,
      name: input.name,
      merchant_id: input.merchant_id ?? null,
      category_id: input.category_id ?? null,
      account_id: input.account_id ?? null,
      expected_minor: input.expected_minor,
      currency_code: input.currency_code ?? 'CAD',
      frequency: input.frequency,
      interval: input.interval ?? 1,
      day_of_month: input.day_of_month ?? null,
      day_of_week: input.day_of_week ?? null,
      starts_on: input.starts_on,
      ends_on: input.ends_on ?? null,
      is_active: true,
      amount_tolerance_percent: input.amount_tolerance_percent ?? 10,
      date_tolerance_days: input.date_tolerance_days ?? 5,
      created_at: this.clock.now(),
    };
    await this.adapter.insert(RECURRING_BILLS, bill);
    return bill;
  }

  async list(userId: UUID, includeInactive = false): Promise<RecurringBill[]> {
    return (await this.adapter.all<RecurringBill>(RECURRING_BILLS))
      .filter((b) => b.user_id === userId)
      .filter((b) => (includeInactive ? true : b.is_active))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async setActive(userId: UUID, id: UUID, active: boolean): Promise<void> {
    const bill = await this.adapter.get<RecurringBill>(RECURRING_BILLS, id);
    if (!bill || bill.user_id !== userId) throw new Error(`bill ${id} not found`);
    await this.adapter.update<RecurringBill>(RECURRING_BILLS, id, { is_active: active });
  }

  async remove(userId: UUID, id: UUID): Promise<void> {
    const bill = await this.adapter.get<RecurringBill>(RECURRING_BILLS, id);
    if (!bill || bill.user_id !== userId) throw new Error(`bill ${id} not found`);
    await this.adapter.remove(RECURRING_BILLS, id);
  }
}
