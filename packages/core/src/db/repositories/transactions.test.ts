import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '../adapter.js';
import { TransactionRepository, TRANSACTION_SPLITS } from './transactions.js';
import { fixedClock } from '../clock.js';
import { toMinor } from '../../money/minor.js';
import type { TransactionSplit } from '../types.js';

const USER_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const USER_B = 'bbbbbbbb-0000-4000-8000-000000000002';

function makeRepo() {
  const adapter = new InMemoryAdapter();
  // Deterministic ids so assertions are stable.
  let n = 0;
  const newId = () => `id-${(++n).toString().padStart(4, '0')}`;
  const repo = new TransactionRepository(adapter, {
    clock: fixedClock('2026-07-23T12:00:00.000Z'),
    newId,
  });
  return { adapter, repo };
}

describe('TransactionRepository.create', () => {
  let repo: TransactionRepository;
  let adapter: InMemoryAdapter;
  beforeEach(() => {
    ({ repo, adapter } = makeRepo());
  });

  it('creates a single-split transaction', async () => {
    const { transaction, splits } = await repo.create({
      user_id: USER_A,
      kind: 'expense',
      occurred_at: '2026-07-20T10:00:00.000Z',
      total_minor: toMinor('42.00'),
      base_total_minor: toMinor('42.00'),
      splits: [{ amount_minor: toMinor('42.00'), base_amount_minor: toMinor('42.00') }],
    });
    expect(transaction.id).toBe('id-0001');
    expect(splits).toHaveLength(1);
    expect(transaction.deleted_at).toBeNull();
    expect(transaction.is_user_entered).toBe(true);
  });

  it('creates a multi-split transaction in one atomic write', async () => {
    const { splits } = await repo.create({
      user_id: USER_A,
      kind: 'expense',
      occurred_at: '2026-07-20T10:00:00.000Z',
      total_minor: toMinor('100.00'),
      base_total_minor: toMinor('100.00'),
      splits: [
        { amount_minor: toMinor('60.00'), base_amount_minor: toMinor('60.00') },
        { amount_minor: toMinor('40.00'), base_amount_minor: toMinor('40.00') },
      ],
    });
    expect(splits).toHaveLength(2);
    const stored = await adapter.all<TransactionSplit>(TRANSACTION_SPLITS);
    expect(stored).toHaveLength(2);
  });

  it('rejects splits that do not sum to the total (invariant), writing nothing', async () => {
    await expect(
      repo.create({
        user_id: USER_A,
        kind: 'expense',
        occurred_at: '2026-07-20T10:00:00.000Z',
        total_minor: toMinor('100.00'),
        base_total_minor: toMinor('100.00'),
        splits: [
          { amount_minor: toMinor('60.00'), base_amount_minor: toMinor('60.00') },
          { amount_minor: toMinor('30.00'), base_amount_minor: toMinor('30.00') },
        ],
      }),
    ).rejects.toThrow(/must equal transaction total/);
    // Nothing partially written.
    const stored = await adapter.all<TransactionSplit>(TRANSACTION_SPLITS);
    expect(stored).toHaveLength(0);
  });

  it('requires at least one split', async () => {
    await expect(
      repo.create({
        user_id: USER_A,
        kind: 'expense',
        occurred_at: '2026-07-20T10:00:00.000Z',
        total_minor: toMinor('0'),
        base_total_minor: toMinor('0'),
        splits: [],
      }),
    ).rejects.toThrow(/at least one split/);
  });

  it('supports a transfer as one transaction with an offsetting negative split', async () => {
    const { transaction } = await repo.create({
      user_id: USER_A,
      kind: 'transfer',
      occurred_at: '2026-07-20T10:00:00.000Z',
      total_minor: toMinor('0'),
      base_total_minor: toMinor('0'),
      splits: [
        { amount_minor: toMinor('200.00'), base_amount_minor: toMinor('200.00') },
        { amount_minor: toMinor('-200.00'), base_amount_minor: toMinor('-200.00') },
      ],
    });
    expect(transaction.kind).toBe('transfer');
  });
});

describe('TransactionRepository soft delete & listing', () => {
  it('excludes soft-deleted rows from get and list', async () => {
    const { repo } = makeRepo();
    const { transaction } = await repo.create({
      user_id: USER_A,
      kind: 'expense',
      occurred_at: '2026-07-20T10:00:00.000Z',
      total_minor: toMinor('10.00'),
      base_total_minor: toMinor('10.00'),
      splits: [{ amount_minor: toMinor('10.00'), base_amount_minor: toMinor('10.00') }],
    });
    await repo.softDelete(USER_A, transaction.id);
    expect(await repo.get(USER_A, transaction.id)).toBeNull();
    expect(await repo.list(USER_A)).toHaveLength(0);
  });

  it('lists newest-first and filters by occurred_at range', async () => {
    const { repo } = makeRepo();
    for (const day of ['05', '20', '28']) {
      await repo.create({
        user_id: USER_A,
        kind: 'expense',
        occurred_at: `2026-07-${day}T10:00:00.000Z`,
        total_minor: toMinor('1.00'),
        base_total_minor: toMinor('1.00'),
        splits: [{ amount_minor: toMinor('1.00'), base_amount_minor: toMinor('1.00') }],
      });
    }
    const all = await repo.list(USER_A);
    expect(all.map((t) => t.transaction.occurred_at)).toEqual([
      '2026-07-28T10:00:00.000Z',
      '2026-07-20T10:00:00.000Z',
      '2026-07-05T10:00:00.000Z',
    ]);
    const midMonth = await repo.list(USER_A, {
      from: '2026-07-10T00:00:00.000Z',
      to: '2026-07-25T00:00:00.000Z',
    });
    expect(midMonth).toHaveLength(1);
    expect(midMonth[0]!.transaction.occurred_at).toBe('2026-07-20T10:00:00.000Z');
  });
});

describe('TransactionRepository user isolation (RLS mirror)', () => {
  it('user B cannot read or delete user A rows', async () => {
    const { repo } = makeRepo();
    const { transaction } = await repo.create({
      user_id: USER_A,
      kind: 'expense',
      occurred_at: '2026-07-20T10:00:00.000Z',
      total_minor: toMinor('10.00'),
      base_total_minor: toMinor('10.00'),
      splits: [{ amount_minor: toMinor('10.00'), base_amount_minor: toMinor('10.00') }],
    });
    expect(await repo.get(USER_B, transaction.id)).toBeNull();
    expect(await repo.list(USER_B)).toHaveLength(0);
    await expect(repo.softDelete(USER_B, transaction.id)).rejects.toThrow(/not found/);
    // Still intact for the owner.
    expect(await repo.get(USER_A, transaction.id)).not.toBeNull();
  });
});
