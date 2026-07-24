/**
 * Apply all BudgetOS migrations to a Postgres database in one transaction.
 *
 * Usage:
 *   SUPABASE_DB_URL="postgresql://…pooler.supabase.com:5432/postgres" npm run db:push
 *
 * Use the Supabase **Session pooler** connection string (Dashboard → Project
 * Settings → Database → Connection string → "Session pooler", URI). The pooler
 * is IPv4; the direct `db.<ref>.supabase.co` host is IPv6-only and unreachable
 * from many networks. The URL contains your DB password — keep it out of git
 * (it's read from the environment, never written to a file here).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('SUPABASE_DB_URL is not set. See scripts/db-push.mjs header for how to get it.');
  process.exit(1);
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');
const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });

try {
  await client.connect();
  console.log(`Connected. Applying ${files.length} migrations…`);
  await client.query('begin');
  for (const f of files) {
    const sql = readFileSync(join(migrationsDir, f), 'utf8');
    process.stdout.write(`  ${f} … `);
    await client.query(sql);
    console.log('ok');
  }
  await client.query('commit');
  console.log('\n✅ Schema applied. All migrations committed.');
} catch (e) {
  try { await client.query('rollback'); } catch {}
  console.error(`\n❌ Failed: ${e.message}\nNothing was applied (rolled back). If tables already exist, the schema is likely already in place.`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
