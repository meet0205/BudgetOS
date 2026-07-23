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

/** Crisp SF-Symbol-style line icons (stroke = currentColor). */
const ICONS: Record<ViewKey, JSX.Element> = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
    </svg>
  ),
  transactions: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4L3 7l3 3" />
      <path d="M3 7h13" />
      <path d="M18 20l3-3-3-3" />
      <path d="M21 17H8" />
    </svg>
  ),
  accounts: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="5.5" width="19" height="13" rx="3" />
      <path d="M2.5 9.5h19" />
      <path d="M6 14.5h4" />
    </svg>
  ),
  categories: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <circle cx="3.5" cy="6" r="1.4" />
      <circle cx="3.5" cy="12" r="1.4" />
      <circle cx="3.5" cy="18" r="1.4" />
    </svg>
  ),
};

const NAV: { key: ViewKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'categories', label: 'Categories' },
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
              <span className="nav-icon">{ICONS[n.key]}</span>
              <span>{n.label}</span>
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
