import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '../adapter.js';
import { IncomeRepository, INCOME_DEDUCTIONS, INCOME_SOURCES } from './income.js';
import { fixedClock } from '../clock.js';
import { toMinor } from '../../money/minor.js';
import type { IncomeDeduction, IncomeSource } from '../types.js';

const USER_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const USER_B = 'bbbbbbbb-0000-4000-8000-000000000002';

function makeRepo() {
  const adapter = new InMemoryAdapter();
  let n = 0;
  const newId = () => `id-${(++n).toString().padStart(4, '0')}`;
  const repo = new IncomeRepository(adapter, { clock: fixedClock('2026-07-23T12:00:00.000Z'), newId });
  return { adapter, repo };
}

const empInput = (over: Partial<Parameters<IncomeRepository['create']>[0]> = {}) => ({
  user_id: USER_A,
  income_kind: 'employment' as const,
  employer_name: 'Maritime Logistics Co',
  pay_date: '2026-07-15',
  province: 'NS',
  gross_minor: toMinor('2140.00'),
  net_minor: toMinor('1505.73'),
  pay_frequency: 'biweekly',
  deductions: [
    { kind: 'federal_tax' as const, amount_minor: toMinor('284.10') },
    { kind: 'provincial_tax' as const, amount_minor: toMinor('196.40') },
    { kind: 'cpp' as const, amount_minor: toMinor('118.66') },
    { kind: 'ei' as const, amount_minor: toMinor('35.11') },
  ],
  ...over,
});

describe('IncomeRepository', () => {
  let repo: IncomeRepository;
  let adapter: InMemoryAdapter;
  beforeEach(() => { ({ repo, adapter } = makeRepo()); });

  it('creates a balanced employment stub with deductions atomically', async () => {
    const { document, deductions } = await repo.create(empInput());
    expect(document.reconciles).toBe(true);
    expect(document.tax_year).toBe(2026);
    expect(deductions).toHaveLength(4);
    const stored = (await adapter.all<IncomeDeduction>(INCOME_DEDUCTIONS)).filter((d) => d.income_document_id === document.id);
    expect(stored).toHaveLength(4);
  });

  it('rejects an unbalanced employment stub and rolls back', async () => {
    await expect(repo.create(empInput({ net_minor: toMinor('1400.00') }))).rejects.toThrow(/balance/);
    // Nothing persisted — no deductions, no source.
    expect(await adapter.all<IncomeDeduction>(INCOME_DEDUCTIONS)).toHaveLength(0);
    expect(await adapter.all<IncomeSource>(INCOME_SOURCES)).toHaveLength(0);
  });

  it('saves self-employment income with no deductions', async () => {
    const { document } = await repo.create({
      user_id: USER_A, income_kind: 'self_employment', employer_name: 'Uber',
      pay_date: '2026-07-10', province: 'NS', gross_minor: toMinor('812.40'),
      platform_fees_minor: toMinor('162.48'),
    });
    expect(document.reconciles).toBe(true);
    expect(document.net_minor).toBeNull();
    expect(document.platform_fees_minor).toBe(toMinor('162.48'));
  });

  it('upserts the income source for autocomplete, updating typical gross', async () => {
    await repo.create(empInput({ gross_minor: toMinor('2140.00'), net_minor: toMinor('1505.73') }));
    await repo.create(empInput({
      pay_date: '2026-07-29', gross_minor: toMinor('2200.00'), net_minor: toMinor('1565.73'),
    }));
    const sources = await repo.listSources(USER_A);
    expect(sources).toHaveLength(1);
    expect(sources[0]!.name).toBe('Maritime Logistics Co');
    expect(sources[0]!.typical_gross_minor).toBe(toMinor('2200.00')); // reflects latest
  });

  it('lists by tax year, newest pay_date first', async () => {
    await repo.create(empInput({ pay_date: '2026-07-01' }));
    await repo.create(empInput({ pay_date: '2026-07-15' }));
    const list = await repo.list(USER_A, 2026);
    expect(list.map((r) => r.document.pay_date)).toEqual(['2026-07-15', '2026-07-01']);
  });

  it('soft-deletes and hides from the list', async () => {
    const { document } = await repo.create(empInput());
    await repo.softDelete(USER_A, document.id);
    expect(await repo.list(USER_A)).toHaveLength(0);
  });

  it('isolates income by user', async () => {
    await repo.create(empInput());
    await repo.create(empInput({ user_id: USER_B, employer_name: 'Other Co' }));
    expect(await repo.list(USER_A)).toHaveLength(1);
    expect(await repo.list(USER_B)).toHaveLength(1);
    expect((await repo.listSources(USER_A))).toHaveLength(1);
  });
});
