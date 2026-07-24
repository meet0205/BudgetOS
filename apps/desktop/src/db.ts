/**
 * App-side wiring of the platform-agnostic core to browser persistence.
 *
 * We back the core's InMemoryAdapter with localStorage: every committed write
 * snapshots the store to a JSON blob. This keeps the running app fully local and
 * offline while `packages/core` stays backend-agnostic — swapping in a Supabase
 * or Dexie adapter later touches only this file.
 */
import {
  InMemoryAdapter,
  ProfileRepository,
  TransactionRepository,
  CategoryRepository,
  AccountRepository,
  MerchantRepository,
  IncomeRepository,
  BucketRepository,
  BillRepository,
  type Profile,
} from '@budgetos/core';

const STORAGE_KEY = 'budgetos.v1';
// Single local user until real auth (Supabase) lands. Matches the RLS mirror.
export const LOCAL_USER = '00000000-0000-4000-8000-0000000000a1';

let adapter: InMemoryAdapter;
const persist = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(adapter.snapshot()));
  } catch {
    // Storage full or unavailable — the in-memory copy still works this session.
  }
};

const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
adapter = raw
  ? InMemoryAdapter.fromSnapshot(JSON.parse(raw), persist)
  : new InMemoryAdapter({ onChange: persist });

export const db = {
  userId: LOCAL_USER,
  adapter,
  profiles: new ProfileRepository(adapter),
  transactions: new TransactionRepository(adapter),
  categories: new CategoryRepository(adapter),
  accounts: new AccountRepository(adapter),
  merchants: new MerchantRepository(adapter),
  income: new IncomeRepository(adapter),
  buckets: new BucketRepository(adapter),
  bills: new BillRepository(adapter),
};

/**
 * Ensure a profile exists and the system taxonomy is seeded. Idempotent, and
 * memoized so React StrictMode's double-invoked effect can't run two concurrent
 * seeds (which would race on inserts).
 */
let bootstrapPromise: Promise<Profile> | null = null;
export function bootstrap(): Promise<Profile> {
  if (!bootstrapPromise) bootstrapPromise = doBootstrap();
  return bootstrapPromise;
}

async function doBootstrap(): Promise<Profile> {
  let profile = await db.profiles.get(LOCAL_USER);
  if (!profile) {
    profile = await db.profiles.create({ id: LOCAL_USER, display_name: 'Me' });
  }
  await db.categories.seedSystemCategories();
  return profile;
}

/** Wipe local data — handy during development. */
export function resetLocalData(): void {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}
