import { useState } from 'react';
import type { AccountKind } from '@budgetos/core';
import { toMinor } from '@budgetos/core';
import type { BudgetData } from '../App.js';
import { db } from '../db.js';
import { money } from '../format.js';

const KINDS: { value: AccountKind; label: string }[] = [
  { value: 'bank', label: 'Bank' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'cash', label: 'Cash' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'investment', label: 'Investment' },
  { value: 'loan', label: 'Loan' },
];

export function Accounts({ data, reload }: { data: BudgetData; reload: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('bank');
  const [opening, setOpening] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) return setErr('Name is required');
    setBusy(true);
    try {
      await db.accounts.create(db.userId, {
        name: name.trim(),
        kind,
        opening_balance_minor: opening ? toMinor(opening) : undefined,
      });
      setName('');
      setOpening('');
      await reload();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive(id: string, archived: boolean) {
    await db.accounts.setArchived(db.userId, id, archived);
    await reload();
  }

  return (
    <div className="view">
      <header className="view-head">
        <h1>Accounts</h1>
        <p className="muted">Where money moves. No bank connection — you track it.</p>
      </header>

      <section className="panel">
        <form className="row-form" onSubmit={add}>
          <input
            className="input grow"
            placeholder="Account name (e.g. Chequing)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
          <input
            className="input narrow"
            placeholder="Opening $"
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
            inputMode="decimal"
          />
          <button className="btn" disabled={busy}>Add</button>
        </form>
        {err && <p className="error">{err}</p>}
      </section>

      <section className="panel">
        {data.accounts.length === 0 ? (
          <div className="empty"><p>No accounts yet. Add one above.</p></div>
        ) : (
          <table className="list-table">
            <thead>
              <tr><th>Name</th><th>Type</th><th className="amount">Opening</th><th className="amount">Balance</th><th></th></tr>
            </thead>
            <tbody>
              {data.accounts.map((a) => {
                const balance = data.balances.get(a.id) ?? a.opening_balance_minor;
                return (
                <tr key={a.id} className={a.is_archived ? 'archived' : ''}>
                  <td>{a.name}{a.is_archived && <span className="tag">archived</span>}</td>
                  <td className="muted">{KINDS.find((k) => k.value === a.kind)?.label ?? a.kind}</td>
                  <td className="amount muted">{money(a.opening_balance_minor, a.currency_code)}</td>
                  <td className={`amount ${balance < 0 ? 'neg' : ''}`}>{money(balance, a.currency_code)}</td>
                  <td className="right">
                    <button className="link-btn" onClick={() => toggleArchive(a.id, !a.is_archived)}>
                      {a.is_archived ? 'Restore' : 'Archive'}
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
