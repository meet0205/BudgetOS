import { useMemo, useState } from 'react';
import {
  toMinor,
  minor,
  remainder,
  prefillNext,
  buildTransfer,
  buildRefund,
  findDuplicates,
  rankBySimilarity,
  type Minor,
  type TxnKind,
  type Category,
} from '@budgetos/core';
import type { BudgetData } from '../App.js';
import { db } from '../db.js';
import { money, formatDate, todayISODate } from '../format.js';

type Mode = 'expense' | 'income' | 'transfer' | 'refund';

interface SplitRow {
  categoryId: string;
  amount: string; // dollars, as typed
  businessOn: boolean;
  businessPct: string;
}

const emptySplit = (): SplitRow => ({ categoryId: '', amount: '', businessOn: false, businessPct: '' });

/** Parse a dollar string to Minor, or null if blank/invalid. */
function parseAmount(s: string): Minor | null {
  if (!s.trim()) return null;
  try {
    return toMinor(s);
  } catch {
    return null;
  }
}

export function Transactions({ data, reload }: { data: BudgetData; reload: () => Promise<void> }) {
  const txnCategories = useMemo(
    () => data.categories.filter((c) => c.layer === 'transaction' && !c.is_hidden),
    [data.categories],
  );
  const activeAccounts = data.accounts.filter((a) => !a.is_archived);

  const [mode, setMode] = useState<Mode>('expense');
  const [amount, setAmount] = useState(''); // total, for expense/income/transfer/refund
  const [merchantName, setMerchantName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState(''); // transfer destination
  const [refundOfId, setRefundOfId] = useState(''); // refund original
  const [date, setDate] = useState(todayISODate());
  const [note, setNote] = useState('');
  const [splitMode, setSplitMode] = useState(false);
  const [splits, setSplits] = useState<SplitRow[]>([emptySplit()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const total = parseAmount(amount);
  const isLedgerEntry = mode === 'expense' || mode === 'income';

  // Split amounts as Minor for the remainder indicator (only meaningful in splitMode).
  const splitMinors = splits.map((s) => parseAmount(s.amount) ?? minor(0));
  const rem = total !== null ? remainder(total, splitMinors) : minor(0);

  function resetForm() {
    setAmount('');
    setMerchantName('');
    setToAccountId('');
    setRefundOfId('');
    setNote('');
    setSplitMode(false);
    setSplits([emptySplit()]);
  }

  function updateSplit(i: number, patch: Partial<SplitRow>) {
    setSplits((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function addSplitRow() {
    if (total === null) return setErr('Enter the total amount first');
    setSplitMode(true);
    setSplits((rows) => {
      const used = rows.map((r) => parseAmount(r.amount) ?? minor(0));
      const next = prefillNext(total, used);
      return [...rows, { ...emptySplit(), amount: next > 0 ? (next / 100).toFixed(2) : '' }];
    });
  }

  function removeSplitRow(i: number) {
    setSplits((rows) => {
      const kept = rows.filter((_, idx) => idx !== i);
      return kept.length ? kept : [emptySplit()];
    });
    if (splits.length <= 2) setSplitMode(false);
  }

  // Merchant autocomplete suggestions (client-side trigram rank over loaded merchants).
  const suggestions = useMemo(() => {
    if (!merchantName.trim() || !isLedgerEntry) return [];
    return rankBySimilarity(merchantName, data.merchants, (m) => m.name, 0.3)
      .slice(0, 5)
      .map((r) => r.item);
  }, [merchantName, data.merchants, isLedgerEntry]);

  function pickMerchant(name: string, defaultCategoryId: string | null) {
    setMerchantName(name);
    // Prefill the first split's category from the merchant's usual one.
    if (defaultCategoryId && !splitMode) {
      updateSplit(0, { categoryId: defaultCategoryId });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    try {
      if (mode === 'transfer') {
        return await submitTransfer();
      }
      if (mode === 'refund') {
        return await submitRefund();
      }
      return await submitLedger();
    } catch (ex) {
      setErr(String(ex));
    }
  }

  async function submitLedger() {
    if (total === null || total <= 0) return setErr('Enter a valid amount greater than zero');

    // Build split inputs. Single (non-split) entry puts the whole total on one category.
    const rows = splitMode ? splits : [{ ...splits[0]!, amount }];
    const splitInputs = rows.map((r) => {
      const amt = parseAmount(r.amount);
      if (amt === null || amt <= 0) throw new Error('Every split needs an amount greater than zero');
      const pct = r.businessOn ? Number(r.businessPct || '0') : 0;
      if (pct < 0 || pct > 100) throw new Error('Business use must be between 0 and 100%');
      return {
        amount_minor: amt,
        base_amount_minor: amt,
        category_id: r.categoryId || null,
        business_use_percent: pct,
      };
    });

    if (splitMode && rem !== 0) {
      return setErr(`Splits must total the amount — ${rem > 0 ? 'add' : 'remove'} ${money(minor(Math.abs(rem)))}`);
    }

    setBusy(true);
    try {
      const merchant = await db.merchants.resolveOnSave(db.userId, merchantName, {
        defaultCategoryId: splitInputs[0]?.category_id ?? null,
      });

      // Duplicate detection — ask, don't block.
      const dups = findDuplicates(data.transactions, {
        total_minor: total,
        merchant_id: merchant?.id ?? null,
        occurred_at: new Date(date + 'T12:00:00').toISOString(),
      });
      if (dups.length > 0) {
        const ok = window.confirm(
          `A ${money(total)} transaction${merchant ? ` at ${merchant.name}` : ''} already exists on ${formatDate(dups[0]!.transaction.occurred_at)}. Add anyway?`,
        );
        if (!ok) {
          setBusy(false);
          return;
        }
      }

      await db.transactions.create({
        user_id: db.userId,
        kind: mode as TxnKind,
        occurred_at: new Date(date + 'T12:00:00').toISOString(),
        total_minor: total,
        base_total_minor: total,
        account_id: accountId || null,
        merchant_id: merchant?.id ?? null,
        note: note.trim() || null,
        splits: splitInputs,
      });
      resetForm();
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function submitTransfer() {
    if (total === null || total <= 0) return setErr('Enter a valid amount greater than zero');
    if (!accountId || !toAccountId) return setErr('Choose both accounts');
    if (accountId === toAccountId) return setErr('Source and destination must differ');

    setBusy(true);
    try {
      await db.transactions.create(
        buildTransfer({
          userId: db.userId,
          amount: total,
          fromAccountId: accountId,
          toAccountId,
          occurredAt: new Date(date + 'T12:00:00').toISOString(),
          note: note.trim() || null,
        }),
      );
      resetForm();
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function submitRefund() {
    if (total === null || total <= 0) return setErr('Enter a valid amount greater than zero');
    if (!refundOfId) return setErr('Pick the transaction this refunds');
    const original = data.transactions.find((t) => t.transaction.id === refundOfId);
    if (!original) return setErr('Original transaction not found');

    setBusy(true);
    try {
      await db.transactions.create(
        buildRefund({
          userId: db.userId,
          original,
          amount: total,
          occurredAt: new Date(date + 'T12:00:00').toISOString(),
          accountId: accountId || null,
          note: note.trim() || null,
        }),
      );
      resetForm();
      await reload();
    } finally {
      setBusy(false);
    }
  }

  // Recent expenses are refund candidates; same merchant surfaces first via the picker order.
  const refundCandidates = data.transactions.filter((t) => t.transaction.kind === 'expense').slice(0, 30);

  const catName = (id: string | null) =>
    id ? (data.categories.find((c) => c.id === id)?.display_name ?? '—') : '—';
  const acctName = (id: string | null) =>
    id ? (data.accounts.find((a) => a.id === id)?.name ?? '—') : '—';
  const merchName = (id: string | null) =>
    id ? (data.merchants.find((m) => m.id === id)?.name ?? '') : '';

  return (
    <div className="view">
      <header className="view-head">
        <h1>Transactions</h1>
        <p className="muted">Enter income, expenses, transfers, and refunds by hand.</p>
      </header>

      <section className="panel">
        <div className="mode-tabs">
          {(['expense', 'income', 'transfer', 'refund'] as Mode[]).map((mk) => (
            <button
              key={mk}
              type="button"
              className={`mode-tab ${mode === mk ? 'active' : ''}`}
              onClick={() => { setMode(mk); setErr(null); }}
            >
              {mk[0]!.toUpperCase() + mk.slice(1)}
            </button>
          ))}
        </div>

        <form className="entry-form" onSubmit={submit}>
          <div className="field-row">
            <label className="field narrow">
              <span>Amount</span>
              <input className="input" placeholder="$0.00" value={amount}
                onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoFocus />
            </label>

            <label className="field narrow">
              <span>Date</span>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>

            {mode === 'transfer' ? (
              <>
                <label className="field">
                  <span>From account</span>
                  <AccountSelect value={accountId} onChange={setAccountId} accounts={activeAccounts} />
                </label>
                <label className="field">
                  <span>To account</span>
                  <AccountSelect value={toAccountId} onChange={setToAccountId} accounts={activeAccounts} />
                </label>
              </>
            ) : (
              <label className="field">
                <span>{mode === 'refund' ? 'Refunded to account' : 'Account'}</span>
                <AccountSelect value={accountId} onChange={setAccountId} accounts={activeAccounts} />
              </label>
            )}
          </div>

          {isLedgerEntry && (
            <div className="field-row">
              <div className="field grow autocomplete">
                <span>Merchant</span>
                <input className="input" placeholder="e.g. Walmart" value={merchantName}
                  onChange={(e) => setMerchantName(e.target.value)} autoComplete="off" />
                {suggestions.length > 0 && (
                  <ul className="suggestions">
                    {suggestions.map((m) => (
                      <li key={m.id}>
                        <button type="button" onMouseDown={(e) => { e.preventDefault(); pickMerchant(m.name, m.default_category_id); }}>
                          {m.name}
                          {m.default_category_id && <span className="muted"> · {catName(m.default_category_id)}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {mode === 'refund' && (
            <div className="field-row">
              <label className="field grow">
                <span>Refund of</span>
                <select className="input" value={refundOfId} onChange={(e) => setRefundOfId(e.target.value)}>
                  <option value="">Pick the original transaction…</option>
                  {refundCandidates.map((t) => (
                    <option key={t.transaction.id} value={t.transaction.id}>
                      {formatDate(t.transaction.occurred_at)} · {money(t.transaction.total_minor)}
                      {merchName(t.transaction.merchant_id) ? ` · ${merchName(t.transaction.merchant_id)}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {isLedgerEntry && (
            <div className="splits">
              <div className="splits-head">
                <span>{splitMode ? 'Splits' : 'Category'}</span>
                {!splitMode && <button type="button" className="link-btn" onClick={addSplitRow}>Split across categories</button>}
              </div>

              {(splitMode ? splits : splits.slice(0, 1)).map((row, i) => (
                <div className="split-row" key={i}>
                  <CategorySelect
                    value={row.categoryId}
                    onChange={(v) => updateSplit(i, { categoryId: v })}
                    categories={txnCategories}
                  />
                  {splitMode && (
                    <input className="input narrow" placeholder="$" value={row.amount} inputMode="decimal"
                      onChange={(e) => updateSplit(i, { amount: e.target.value })} />
                  )}
                  <label className="biz-toggle">
                    <input type="checkbox" checked={row.businessOn}
                      onChange={(e) => updateSplit(i, { businessOn: e.target.checked })} />
                    Business
                  </label>
                  {row.businessOn && (
                    <input className="input tiny" placeholder="%" value={row.businessPct} inputMode="numeric"
                      onChange={(e) => updateSplit(i, { businessPct: e.target.value })} />
                  )}
                  {splitMode && (
                    <button type="button" className="link-btn danger" onClick={() => removeSplitRow(i)}>×</button>
                  )}
                </div>
              ))}

              {splitMode && (
                <div className="splits-foot">
                  <button type="button" className="link-btn" onClick={addSplitRow}>+ Add split</button>
                  <span className={`remainder ${rem === 0 ? 'ok' : rem > 0 ? 'under' : 'over'}`}>
                    {rem === 0 ? 'Balanced' : rem > 0
                      ? `${money(minor(rem))} left`
                      : `${money(minor(-rem))} over`}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="field-row">
            <label className="field grow">
              <span>Note</span>
              <input className="input" placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <button className="btn primary" disabled={busy}>
              {busy ? 'Saving…' : `Add ${mode}`}
            </button>
          </div>
          {err && <p className="error">{err}</p>}
        </form>
      </section>

      <section className="panel">
        {data.transactions.length === 0 ? (
          <div className="empty"><p>No transactions yet.</p></div>
        ) : (
          <table className="list-table">
            <thead>
              <tr><th>Date</th><th>Kind</th><th>Merchant</th><th>Category</th><th>Account</th><th className="amount">Amount</th><th></th></tr>
            </thead>
            <tbody>
              {data.transactions.map((t) => {
                const k = t.transaction.kind;
                const sign = k === 'income' || k === 'refund' ? 'pos' : k === 'transfer' ? '' : 'neg';
                const catCell = t.splits.length > 1
                  ? <span className="muted">Split ×{t.splits.length}</span>
                  : <span className="chip">{catName(t.splits[0]?.category_id ?? null)}</span>;
                const acctLabel = k === 'transfer'
                  ? `${acctName(t.transaction.account_id)} → ${acctName(t.transaction.counterparty_account_id)}`
                  : acctName(t.transaction.account_id);
                return (
                  <tr key={t.transaction.id}>
                    <td className="date">{formatDate(t.transaction.occurred_at)}</td>
                    <td><span className={`pill pill-${k}`}>{k}</span></td>
                    <td>{merchName(t.transaction.merchant_id) || <span className="muted">—</span>}</td>
                    <td>{k === 'transfer' ? <span className="muted">—</span> : catCell}</td>
                    <td className="muted">{acctLabel}</td>
                    <td className={`amount ${sign}`}>{money(t.transaction.total_minor)}</td>
                    <td className="right">
                      <button className="link-btn danger" onClick={() => del(t.transaction.id)}>Delete</button>
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

  async function del(id: string) {
    await db.transactions.softDelete(db.userId, id);
    await reload();
  }
}

function AccountSelect({ value, onChange, accounts }: {
  value: string; onChange: (v: string) => void; accounts: BudgetData['accounts'];
}) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Account…</option>
      {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  );
}

function CategorySelect({ value, onChange, categories }: {
  value: string; onChange: (v: string) => void; categories: Category[];
}) {
  return (
    <select className="input grow" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Category…</option>
      {categories.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
    </select>
  );
}
