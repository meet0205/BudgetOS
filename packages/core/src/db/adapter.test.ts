import { describe, it, expect } from 'vitest';
import { InMemoryAdapter } from './adapter.js';

describe('InMemoryAdapter persistence hook', () => {
  it('fires onChange after inserts, updates, and committed transactions', async () => {
    let changes = 0;
    const a = new InMemoryAdapter({ onChange: () => (changes += 1) });
    await a.insert('t', { id: '1', v: 1 });
    await a.update<{ id: string; v: number }>('t', '1', { v: 2 });
    await a.tx(async (tx) => {
      await tx.insert('t', { id: '2', v: 1 });
      await tx.insert('t', { id: '3', v: 1 });
    });
    expect(changes).toBe(3); // 1 insert + 1 update + 1 per committed tx (once)
  });

  it('does not fire onChange for a rolled-back transaction', async () => {
    let changes = 0;
    const a = new InMemoryAdapter({ onChange: () => (changes += 1) });
    await expect(
      a.tx(async (tx) => {
        await tx.insert('t', { id: '1', v: 1 });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(changes).toBe(0);
    expect(await a.get('t', '1')).toBeNull(); // rolled back
  });

  it('keeps firing onChange after CONCURRENT transactions (regression)', async () => {
    // Two overlapping tx() calls must not leave notifications stuck off — the
    // bug that stopped every write after bootstrap from persisting.
    let changes = 0;
    const a = new InMemoryAdapter({ onChange: () => (changes += 1) });
    await Promise.all([
      a.tx(async (tx) => {
        await tx.insert('t', { id: 'a', v: 1 });
      }),
      a.tx(async (tx) => {
        await tx.insert('t', { id: 'b', v: 1 });
      }),
    ]);
    const afterTx = changes;
    expect(afterTx).toBeGreaterThan(0);

    // The critical assertion: a plain write AFTER concurrent txns still notifies.
    await a.insert('t', { id: 'c', v: 1 });
    expect(changes).toBe(afterTx + 1);
  });

  it('round-trips through snapshot / fromSnapshot', async () => {
    const a = new InMemoryAdapter();
    await a.insert('t', { id: '1', v: 42 });
    const snap = a.snapshot();
    const b = InMemoryAdapter.fromSnapshot(JSON.parse(JSON.stringify(snap)));
    expect(await b.get('t', '1')).toEqual({ id: '1', v: 42 });
  });
});
