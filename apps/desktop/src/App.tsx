import { useCallback, useEffect, useState } from 'react';
import type {
  Account, Category, TransactionWithSplits, Profile, Merchant, Minor,
  IncomeWithDeductions, IncomeSource, AllocationBucket, RecurringBill, Goal,
} from '@budgetos/core';
import { computeBalances } from '@budgetos/core';
import { db, bootstrap, resetLocalData, activateSupabase } from './db.js';
import { supabaseEnabled, loadSession, signOut, type Session } from './supabase/client.js';
import { Login } from './views/Login.js';
import { Dashboard } from './views/Dashboard.js';
import { Accounts } from './views/Accounts.js';
import { Transactions } from './views/Transactions.js';
import { Categories } from './views/Categories.js';
import { Income } from './views/Income.js';
import { Allocation } from './views/Allocation.js';
import { Bills } from './views/Bills.js';
import { Goals } from './views/Goals.js';
import { Tax } from './views/Tax.js';
import { Reports } from './views/Reports.js';
import { Settings } from './views/Settings.js';
import { Explore } from './views/Explore.js';
import { Import } from './views/Import.js';
import { Placeholder, type SectionMeta } from './views/Placeholder.js';

export interface BudgetData {
  profile: Profile;
  accounts: Account[];
  categories: Category[];
  transactions: TransactionWithSplits[];
  merchants: Merchant[];
  income: IncomeWithDeductions[];
  incomeSources: IncomeSource[];
  buckets: AllocationBucket[];
  bills: RecurringBill[];
  goals: Goal[];
  /** Live account balances derived from the ledger (opening + signed activity). */
  balances: Map<string, Minor>;
}

export type ViewKey =
  | 'dashboard' | 'transactions' | 'import' | 'income' | 'tax' | 'allocation'
  | 'bills' | 'reports' | 'explore' | 'goals'
  | 'accounts' | 'categories' | 'settings';

const svg = (children: JSX.Element) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

/** Line icons (stroke = currentColor), one per section. */
const ICONS: Record<ViewKey, JSX.Element> = {
  dashboard: svg(<><rect x="3" y="3" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="2" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" /></>),
  transactions: svg(<><path d="M6 4L3 7l3 3" /><path d="M3 7h13" /><path d="M18 20l3-3-3-3" /><path d="M21 17H8" /></>),
  import: svg(<><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /><path d="M12 3v11" /><path d="M8 10l4 4 4-4" /></>),
  income: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v10" /><path d="M14.6 9.2c0-1-1.2-1.7-2.6-1.7s-2.5.8-2.5 1.9c0 2.6 5.1 1.4 5.1 4 0 1.1-1.2 1.9-2.6 1.9s-2.6-.7-2.6-1.7" /></>),
  tax: svg(<><path d="M5 19L19 5" /><circle cx="7.5" cy="7.5" r="2" /><circle cx="16.5" cy="16.5" r="2" /></>),
  allocation: svg(<><rect x="3" y="5" width="13" height="3.6" rx="1.8" /><rect x="3" y="10.2" width="18" height="3.6" rx="1.8" /><rect x="3" y="15.4" width="8" height="3.6" rx="1.8" /></>),
  bills: svg(<><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8.5 8h7" /><path d="M8.5 12h7" /><path d="M8.5 16h4" /></>),
  reports: svg(<><rect x="4" y="12" width="3.6" height="8" rx="1" /><rect x="10.2" y="7" width="3.6" height="13" rx="1" /><rect x="16.4" y="10" width="3.6" height="10" rx="1" /></>),
  explore: svg(<><circle cx="11" cy="11" r="7" /><path d="M16.2 16.2L21 21" /></>),
  goals: svg(<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.7" fill="currentColor" /></>),
  accounts: svg(<><rect x="2.5" y="5.5" width="19" height="13" rx="3" /><path d="M2.5 9.5h19" /><path d="M6 14.5h4" /></>),
  categories: svg(<><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><circle cx="3.5" cy="6" r="1.4" /><circle cx="3.5" cy="12" r="1.4" /><circle cx="3.5" cy="18" r="1.4" /></>),
  settings: svg(<><path d="M4 7h9" /><circle cx="17" cy="7" r="2.3" /><path d="M20 17h-9" /><circle cx="7" cy="17" r="2.3" /></>),
};

/** Primary nav — mirrors the wireframe sidebar order. */
const NAV: { key: ViewKey; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'import', label: 'Import' },
  { key: 'income', label: 'Income' },
  { key: 'tax', label: 'Tax' },
  { key: 'allocation', label: 'Allocation' },
  { key: 'bills', label: 'Bills' },
  { key: 'reports', label: 'Reports' },
  { key: 'explore', label: 'Explore' },
  { key: 'goals', label: 'Goals' },
];

/** Setup/reference sections in the footer group. */
const FOOT_NAV: { key: ViewKey; label: string }[] = [
  { key: 'accounts', label: 'Accounts' },
  { key: 'categories', label: 'Categories' },
  { key: 'settings', label: 'Settings' },
];

/** Metadata for sections whose feature isn't built — drives the honest placeholder. */
const SECTIONS: Partial<Record<ViewKey, SectionMeta>> = {};

export function App() {
  const [data, setData] = useState<BudgetData | null>(null);
  const [view, setView] = useState<ViewKey>('dashboard');
  const [error, setError] = useState<string | null>(null);
  // Cloud auth: when Supabase is configured, gate the app behind sign-in.
  const [session, setSession] = useState<Session | null>(supabaseEnabled ? loadSession() : null);
  const needsLogin = supabaseEnabled && !session;

  const reload = useCallback(async () => {
    const [profile, accounts, categories, transactions, merchants, income, incomeSources, buckets, bills, goals] = await Promise.all([
      db.profiles.get(db.userId),
      db.accounts.list(db.userId, true),
      db.categories.listVisible(db.userId),
      db.transactions.list(db.userId),
      db.merchants.list(db.userId),
      db.income.list(db.userId),
      db.income.listSources(db.userId),
      db.buckets.list(db.userId, true),
      db.bills.list(db.userId, true),
      db.goals.list(db.userId),
    ]);
    const balances = computeBalances(accounts, transactions);
    setData({ profile: profile!, accounts, categories, transactions, merchants, income, incomeSources, buckets, bills, goals, balances });
  }, []);

  useEffect(() => {
    if (needsLogin) return; // wait for sign-in before touching the backend
    if (supabaseEnabled && session) activateSupabase(session.user.id);
    bootstrap()
      .then(reload)
      .catch((e) => setError(String(e)));
  }, [reload, needsLogin, session]);

  if (needsLogin) return <Login onAuthed={setSession} />;
  if (error) return <div className="fatal">Failed to start: {error}</div>;
  if (!data) return <div className="loading">Loading BudgetOS…</div>;

  const period = new Date().toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-name">Budget</div>
          <div className="brand-period">{period} · {data.profile.province}</div>
        </div>
        <nav>
          {NAV.map((n) => (
            <NavButton key={n.key} n={n} view={view} setView={setView} />
          ))}
        </nav>
        <div className="sidebar-foot">
          {FOOT_NAV.map((n) => (
            <NavButton key={n.key} n={n} view={view} setView={setView} />
          ))}
          <div className="region">🍁 {data.profile.province} · {data.profile.base_currency}{db.cloud ? ' · synced' : ''}</div>
          {db.cloud
            ? <button className="link-btn" onClick={() => { signOut(); location.reload(); }}>Sign out{session?.user.email ? ` (${session.user.email})` : ''}</button>
            : <button className="link-btn" onClick={resetLocalData}>Reset local data</button>}
        </div>
      </aside>

      <main className="content">
        {view === 'dashboard' && <Dashboard data={data} onGo={setView} />}
        {view === 'transactions' && <Transactions data={data} reload={reload} />}
        {view === 'import' && <Import data={data} reload={reload} />}
        {view === 'income' && <Income data={data} reload={reload} />}
        {view === 'tax' && <Tax data={data} reload={reload} />}
        {view === 'allocation' && <Allocation data={data} reload={reload} />}
        {view === 'bills' && <Bills data={data} reload={reload} />}
        {view === 'reports' && <Reports data={data} />}
        {view === 'explore' && <Explore data={data} />}
        {view === 'goals' && <Goals data={data} reload={reload} />}
        {view === 'accounts' && <Accounts data={data} reload={reload} />}
        {view === 'categories' && <Categories data={data} />}
        {view === 'settings' && <Settings data={data} reload={reload} />}
        {SECTIONS[view] && <Placeholder meta={SECTIONS[view]!} />}
      </main>
    </div>
  );
}

function NavButton({
  n, view, setView,
}: {
  n: { key: ViewKey; label: string }; view: ViewKey; setView: (v: ViewKey) => void;
}) {
  return (
    <button
      className={`nav-item ${view === n.key ? 'active' : ''}`}
      onClick={() => setView(n.key)}
    >
      <span className="nav-icon">{ICONS[n.key]}</span>
      <span>{n.label}</span>
    </button>
  );
}
