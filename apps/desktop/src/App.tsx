import { useCallback, useEffect, useState } from 'react';
import type { Account, Category, TransactionWithSplits, Profile, Merchant, Minor } from '@budgetos/core';
import { computeBalances } from '@budgetos/core';
import { db, bootstrap, resetLocalData } from './db.js';
import { Dashboard } from './views/Dashboard.js';
import { Accounts } from './views/Accounts.js';
import { Transactions } from './views/Transactions.js';
import { Categories } from './views/Categories.js';

export interface BudgetData {
  profile: Profile;
  accounts: Account[];
  categories: Category[];
  transactions: TransactionWithSplits[];
  merchants: Merchant[];
  /** Live account balances derived from the ledger (opening + signed activity). */
  balances: Map<string, Minor>;
}

export type ViewKey = 'dashboard' | 'transactions' | 'accounts' | 'categories';

const NAV: { key: ViewKey; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '◫' },
  { key: 'transactions', label: 'Transactions', icon: '⇄' },
  { key: 'accounts', label: 'Accounts', icon: '▤' },
  { key: 'categories', label: 'Categories', icon: '☰' },
];

export function App() {
  const [data, setData] = useState<BudgetData | null>(null);
  const [view, setView] = useState<ViewKey>('dashboard');
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [profile, accounts, categories, transactions, merchants] = await Promise.all([
      db.profiles.get(db.userId),
      db.accounts.list(db.userId, true),
      db.categories.listVisible(db.userId),
      db.transactions.list(db.userId),
      db.merchants.list(db.userId),
    ]);
    const balances = computeBalances(accounts, transactions);
    setData({ profile: profile!, accounts, categories, transactions, merchants, balances });
  }, []);

  useEffect(() => {
    bootstrap()
      .then(reload)
      .catch((e) => setError(String(e)));
  }, [reload]);

  if (error) return <div className="fatal">Failed to start: {error}</div>;
  if (!data) return <div className="loading">Loading BudgetOS…</div>;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">₿</span>
          <span className="brand-name">BudgetOS</span>
        </div>
        <nav>
          {NAV.map((n) => (
            <button
              key={n.key}
              className={`nav-item ${view === n.key ? 'active' : ''}`}
              onClick={() => setView(n.key)}
            >
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="region">🇨🇦 {data.profile.province} · {data.profile.base_currency}</div>
          <button className="link-btn" onClick={resetLocalData}>Reset local data</button>
        </div>
      </aside>

      <main className="content">
        {view === 'dashboard' && <Dashboard data={data} onGo={setView} />}
        {view === 'transactions' && <Transactions data={data} reload={reload} />}
        {view === 'accounts' && <Accounts data={data} reload={reload} />}
        {view === 'categories' && <Categories data={data} />}
      </main>
    </div>
  );
}
