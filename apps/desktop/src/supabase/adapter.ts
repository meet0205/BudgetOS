import type { Adapter } from '@budgetos/core';
import { rest, validToken } from './client.js';

/**
 * A Supabase/PostgREST-backed Adapter. Reads and writes go over HTTPS with the
 * signed-in user's token, so row-level security scopes every query to that user
 * automatically — the cloud mirror of the InMemoryAdapter's per-user filtering.
 *
 * tx() runs its writes sequentially: PostgREST has no cross-request transaction,
 * so this is best-effort rather than atomic. The app validates invariants (e.g.
 * split-sum) before writing, so a mid-sequence failure is rare and leaves the
 * parent recoverable rather than silently corrupt.
 */
export class SupabaseAdapter implements Adapter {
  async insert<T extends { id: string }>(table: string, row: T): Promise<void> {
    const token = await this.token();
    await rest('POST', table, { body: row, token, representation: true });
  }

  async update<T extends { id: string }>(table: string, id: string, patch: Partial<T>): Promise<void> {
    const token = await this.token();
    await rest('PATCH', `${table}?id=eq.${encodeURIComponent(id)}`, { body: patch, token });
  }

  async get<T>(table: string, id: string): Promise<T | null> {
    const token = await this.token();
    const rows = (await rest('GET', `${table}?id=eq.${encodeURIComponent(id)}&limit=1`, { token })) as T[] | null;
    return rows && rows.length ? rows[0]! : null;
  }

  async all<T>(table: string): Promise<T[]> {
    const token = await this.token();
    const rows = (await rest('GET', `${table}?select=*`, { token })) as T[] | null;
    return rows ?? [];
  }

  async remove(table: string, id: string): Promise<void> {
    const token = await this.token();
    await rest('DELETE', `${table}?id=eq.${encodeURIComponent(id)}`, { token });
  }

  async tx<T>(fn: (adapter: Adapter) => Promise<T>): Promise<T> {
    // Best-effort: PostgREST has no multi-statement transaction over REST.
    return fn(this);
  }

  private async token(): Promise<string> {
    const t = await validToken();
    if (!t) throw new Error('Not signed in — no Supabase session');
    return t;
  }
}
