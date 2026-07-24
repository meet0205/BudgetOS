import type { Adapter } from '../adapter.js';
import type {
  IncomeDocument, IncomeDeduction, IncomeSource, IncomeWithDeductions,
  IncomeDocType, IncomeKind, DeductionKind,
} from '../types.js';
import { type Clock, systemClock } from '../clock.js';
import { newId as defaultNewId, type UUID } from '../ids.js';
import type { Minor } from '../../money/minor.js';
import { reconciles } from '../../income/reconcile.js';

export const INCOME_DOCUMENTS = 'income_documents';
export const INCOME_DEDUCTIONS = 'income_deductions';
export const INCOME_SOURCES = 'income_sources';

export interface NewDeductionInput {
  kind: DeductionKind;
  amount_minor: Minor;
  raw_label?: string | null;
  ytd_amount_minor?: Minor | null;
}

export interface NewIncomeInput {
  user_id: UUID;
  income_kind: IncomeKind;
  doc_type?: IncomeDocType;      // defaults to 'manual'
  employer_name?: string | null; // also the self-employment source name
  employer_id?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  pay_date: string;
  tax_year?: number;             // defaults to pay_date's year
  province: string;
  gross_minor: Minor;
  net_minor?: Minor | null;
  ytd_gross_minor?: Minor | null;
  ytd_net_minor?: Minor | null;
  platform_fees_minor?: Minor;
  hst_collected_minor?: Minor;
  currency_code?: string;
  pay_frequency?: string | null;
  deductions?: NewDeductionInput[];
}

const ZM = 0 as Minor;

export class IncomeRepository {
  private readonly newId: () => UUID;
  private readonly clock: Clock;

  constructor(
    private readonly adapter: Adapter,
    options: { clock?: Clock; newId?: () => UUID } = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.newId = options.newId ?? defaultNewId;
  }

  /**
   * Create an income document with its deductions atomically. Employment stubs
   * must balance (gross − deductions === net) — the reconcile check is enforced
   * here, never bypassed, and its result is persisted on the document. Also
   * upserts the income source so employer autocomplete/prefill stays current.
   */
  async create(input: NewIncomeInput): Promise<IncomeWithDeductions> {
    const now = this.clock.now();
    const docId = this.newId();
    const deductionInputs = input.deductions ?? [];
    const taxYear = input.tax_year ?? new Date(input.pay_date + 'T12:00:00').getFullYear();

    const balances = reconciles(
      { income_kind: input.income_kind, gross_minor: input.gross_minor, net_minor: input.net_minor ?? null },
      deductionInputs.map((d) => ({ amount_minor: d.amount_minor })),
    );
    if (input.income_kind === 'employment' && !balances) {
      throw new Error('employment income must balance: gross − deductions must equal net');
    }

    const document: IncomeDocument = {
      id: docId,
      user_id: input.user_id,
      doc_type: input.doc_type ?? 'manual',
      income_kind: input.income_kind,
      source_file_id: null,
      employer_name: input.employer_name ?? null,
      employer_id: input.employer_id ?? null,
      period_start: input.period_start ?? null,
      period_end: input.period_end ?? null,
      pay_date: input.pay_date,
      tax_year: taxYear,
      province: input.province,
      gross_minor: input.gross_minor,
      net_minor: input.net_minor ?? null,
      ytd_gross_minor: input.ytd_gross_minor ?? null,
      ytd_net_minor: input.ytd_net_minor ?? null,
      platform_fees_minor: input.platform_fees_minor ?? ZM,
      hst_collected_minor: input.hst_collected_minor ?? ZM,
      currency_code: input.currency_code ?? 'CAD',
      is_user_entered: true,
      reconciles: balances,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };

    const deductions: IncomeDeduction[] = deductionInputs.map((d) => ({
      id: this.newId(),
      income_document_id: docId,
      user_id: input.user_id,
      kind: d.kind,
      raw_label: d.raw_label ?? null,
      amount_minor: d.amount_minor,
      ytd_amount_minor: d.ytd_amount_minor ?? null,
      is_user_entered: true,
    }));

    await this.adapter.tx(async (a) => {
      await a.insert(INCOME_DOCUMENTS, document);
      for (const d of deductions) await a.insert(INCOME_DEDUCTIONS, d);
      await this.upsertSource(a, input, now);
    });

    return { document, deductions };
  }

  /** Upsert the income source powering autocomplete + prefill. */
  private async upsertSource(a: Adapter, input: NewIncomeInput, now: string): Promise<void> {
    const name = (input.employer_name ?? '').trim();
    if (!name) return;
    const all = await a.all<IncomeSource>(INCOME_SOURCES);
    const existing = all.find((s) => s.user_id === input.user_id && s.name === name);
    if (existing) {
      await a.update<IncomeSource>(INCOME_SOURCES, existing.id, {
        typical_gross_minor: input.gross_minor,
        pay_frequency: input.pay_frequency ?? existing.pay_frequency,
        last_used_at: now,
      });
    } else {
      await a.insert<IncomeSource>(INCOME_SOURCES, {
        id: this.newId(),
        user_id: input.user_id,
        name,
        income_kind: input.income_kind,
        employer_id: input.employer_id ?? null,
        typical_gross_minor: input.gross_minor,
        pay_frequency: input.pay_frequency ?? null,
        last_used_at: now,
      });
    }
  }

  /** List a user's income documents (optionally one tax year), newest pay_date first. */
  async list(userId: UUID, taxYear?: number): Promise<IncomeWithDeductions[]> {
    const docs = (await this.adapter.all<IncomeDocument>(INCOME_DOCUMENTS))
      .filter((d) => d.user_id === userId && d.deleted_at === null)
      .filter((d) => (taxYear === undefined ? true : d.tax_year === taxYear))
      .sort((a, b) => (a.pay_date < b.pay_date ? 1 : a.pay_date > b.pay_date ? -1 : 0));

    const allDed = await this.adapter.all<IncomeDeduction>(INCOME_DEDUCTIONS);
    return docs.map((document) => ({
      document,
      deductions: allDed.filter((d) => d.income_document_id === document.id),
    }));
  }

  /** Sources for autocomplete/prefill, most-recently-used first. */
  async listSources(userId: UUID): Promise<IncomeSource[]> {
    return (await this.adapter.all<IncomeSource>(INCOME_SOURCES))
      .filter((s) => s.user_id === userId)
      .sort((a, b) => (b.last_used_at ?? '').localeCompare(a.last_used_at ?? ''));
  }

  /** Soft-delete an income document. Its deductions cascade in Postgres; here they're left. */
  async softDelete(userId: UUID, id: UUID): Promise<void> {
    const doc = await this.adapter.get<IncomeDocument>(INCOME_DOCUMENTS, id);
    if (!doc || doc.user_id !== userId) throw new Error(`income document ${id} not found`);
    if (doc.deleted_at !== null) return;
    await this.adapter.update<IncomeDocument>(INCOME_DOCUMENTS, id, {
      deleted_at: this.clock.now(),
      updated_at: this.clock.now(),
    });
  }
}
