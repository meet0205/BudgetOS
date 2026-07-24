/**
 * App-side wiring of the platform-agnostic core to a persistence backend.
 *
 * Two modes, chosen at runtime:
 *   - LOCAL  — the core's InMemoryAdapter backed by localStorage (offline, no auth)
 *   - CLOUD  — the SupabaseAdapter (PostgREST + row-level security) once signed in
 *
 * `db` is a live binding reassigned by activateSupabase() after login, so the
 * views (which call db.* at event time) pick up the active backend automatically.
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
  GoalRepository,
  type Adapter,
  type Profile,
} from '@budgetos/core';
import { SupabaseAdapter } from './supabase/adapter.js';

const STORAGE_KEY = 'budgetos.v1';
// Single local user for offline mode. Matches the RLS mirror.
export const LOCAL_USER = '00000000-0000-4000-8000-0000000000a1';

interface Db {
  userId: string;
  adapter: Adapter;
  cloud: boolean;
  profiles: ProfileRepository;
  transactions: TransactionRepository;
  categories: CategoryRepository;
  accounts: AccountRepository;
  merchants: MerchantRepository;
  income: IncomeRepository;
  buckets: BucketRepository;
  bills: BillRepository;
  goals: GoalRepository;
}

function buildDb(adapter: Adapter, userId: string, cloud: boolean): Db {
  return {
    userId,
    adapter,
    cloud,
    profiles: new ProfileRepository(adapter),
    transactions: new TransactionRepository(adapter),
    categories: new CategoryRepository(adapter),
    accounts: new AccountRepository(adapter),
    merchants: new MerchantRepository(adapter),
    income: new IncomeRepository(adapter),
    buckets: new BucketRepository(adapter),
    bills: new BillRepository(adapter),
    goals: new GoalRepository(adapter),
  };
}

// ---- Local backend (default) ----
let localAdapter: InMemoryAdapter;
const persist = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(localAdapter.snapshot()));
  } catch {
    /* storage full/unavailable — in-memory copy still works this session */
  }
};
const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
localAdapter = raw
  ? InMemoryAdapter.fromSnapshot(JSON.parse(raw), persist)
  : new InMemoryAdapter({ onChange: persist });

/** Live binding — reassigned to the cloud backend after sign-in. */
export let db: Db = buildDb(localAdapter, LOCAL_USER, false);

/** Switch the app to the Supabase backend for the signed-in user. */
export function activateSupabase(userId: string): void {
  db = buildDb(new SupabaseAdapter(), userId, true);
  bootstrapPromise = null; // re-bootstrap against the cloud backend
}

/**
 * Ensure a profile exists (and, in local mode, that the system taxonomy is
 * seeded — the cloud DB already has it from the migration). Memoized so React
 * StrictMode's double-invoked effect can't run two concurrent seeds.
 */
let bootstrapPromise: Promise<Profile> | null = null;
export function bootstrap(): Promise<Profile> {
  if (!bootstrapPromise) bootstrapPromise = doBootstrap();
  return bootstrapPromise;
}

async function doBootstrap(): Promise<Profile> {
  let profile = await db.profiles.get(db.userId);
  if (!profile) {
    profile = await db.profiles.create({ id: db.userId, display_name: 'Me' });
  }
  if (!db.cloud) {
    // Cloud already has system categories from migration 0007.
    await db.categories.seedSystemCategories();
  }
  return profile;
}

/** Wipe local data — handy during development (local mode only). */
export function resetLocalData(): void {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}
