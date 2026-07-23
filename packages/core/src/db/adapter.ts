/**
 * The persistence port. Repositories depend only on this interface, keeping
 * `packages/core` backend-agnostic (PRD: keep core platform-agnostic even while
 * building one target).
 *
 * The app supplies a concrete adapter:
 *   - browser:  a Dexie/IndexedDB adapter
 *   - server:   a Supabase/Postgres adapter
 *   - tests:    the InMemoryAdapter below
 *
 * `tx()` runs a set of writes atomically so a transaction and its splits commit
 * or roll back together — the local-first mirror of the deferred sum-check.
 */
export interface Adapter {
  insert<T extends { id: string }>(table: string, row: T): Promise<void>;
  update<T extends { id: string }>(table: string, id: string, patch: Partial<T>): Promise<void>;
  get<T>(table: string, id: string): Promise<T | null>;
  /** All rows in a table. Repositories apply user + soft-delete filtering. */
  all<T>(table: string): Promise<T[]>;
  /** Hard delete a single row. User data uses soft delete instead; this backs merges/tests. */
  remove(table: string, id: string): Promise<void>;
  /** Run writes atomically. On throw, all writes in the unit roll back. */
  tx<T>(fn: (adapter: Adapter) => Promise<T>): Promise<T>;
}

type Tables = Map<string, Map<string, unknown>>;

function clone<T>(value: T): T {
  return structuredCloneSafe(value);
}

function structuredCloneSafe<T>(value: T): T {
  const sc = (globalThis as { structuredClone?: <U>(v: U) => U }).structuredClone;
  if (typeof sc === 'function') return sc(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * In-memory adapter. Deep-copies on the way in and out so callers can't mutate
 * stored rows by reference. `tx()` snapshots the whole store and restores it on
 * throw, giving all-or-nothing semantics for multi-row writes.
 */
export class InMemoryAdapter implements Adapter {
  private tables: Tables;
  private readonly onChange: (() => void) | undefined;

  constructor(options: { tables?: Tables; onChange?: () => void } = {}) {
    this.tables = options.tables ?? new Map();
    this.onChange = options.onChange;
  }

  /** Plain-object snapshot suitable for JSON serialization (e.g. localStorage). */
  snapshot(): Record<string, unknown[]> {
    const out: Record<string, unknown[]> = {};
    for (const [name, rows] of this.tables) out[name] = Array.from(rows.values()).map((r) => clone(r));
    return out;
  }

  /** Rebuild an adapter from a snapshot produced by `snapshot()`. */
  static fromSnapshot(
    data: Record<string, unknown[]>,
    onChange?: () => void,
  ): InMemoryAdapter {
    const tables: Tables = new Map();
    for (const [name, rows] of Object.entries(data)) {
      const map = new Map<string, unknown>();
      for (const row of rows) map.set((row as { id: string }).id, clone(row));
      tables.set(name, map);
    }
    return new InMemoryAdapter({ tables, onChange });
  }

  // Depth of in-flight tx() calls. A plain boolean breaks when two tx() run
  // concurrently (the inner captures the outer's suspended state and can leave
  // it stuck on); a counter returns cleanly to 0 and fires one notify at the end.
  private txDepth = 0;

  private notify(): void {
    if (this.txDepth > 0) return;
    if (this.onChange) this.onChange();
  }

  private table(name: string): Map<string, unknown> {
    let t = this.tables.get(name);
    if (!t) {
      t = new Map();
      this.tables.set(name, t);
    }
    return t;
  }

  async insert<T extends { id: string }>(table: string, row: T): Promise<void> {
    const t = this.table(table);
    if (t.has(row.id)) throw new Error(`insert: ${table}/${row.id} already exists`);
    t.set(row.id, clone(row));
    this.notify();
  }

  async update<T extends { id: string }>(table: string, id: string, patch: Partial<T>): Promise<void> {
    const t = this.table(table);
    const existing = t.get(id);
    if (!existing) throw new Error(`update: ${table}/${id} not found`);
    t.set(id, clone({ ...(existing as object), ...(patch as object) }));
    this.notify();
  }

  async get<T>(table: string, id: string): Promise<T | null> {
    const row = this.table(table).get(id);
    return row ? clone(row as T) : null;
  }

  async all<T>(table: string): Promise<T[]> {
    return Array.from(this.table(table).values()).map((r) => clone(r as T));
  }

  async remove(table: string, id: string): Promise<void> {
    this.table(table).delete(id);
    this.notify();
  }

  async tx<T>(fn: (adapter: Adapter) => Promise<T>): Promise<T> {
    // Snapshot every table, run, restore on throw. Persistence fires once, on
    // successful commit — never for intermediate or rolled-back writes.
    const snapshot: Tables = new Map();
    for (const [name, rows] of this.tables) {
      snapshot.set(name, new Map(Array.from(rows, ([k, v]) => [k, clone(v)])));
    }
    this.txDepth += 1;
    try {
      const result = await fn(this);
      this.txDepth -= 1;
      this.notify();
      return result;
    } catch (err) {
      this.tables = snapshot;
      this.txDepth -= 1;
      throw err;
    }
  }
}
