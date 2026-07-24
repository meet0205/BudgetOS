/**
 * Minimal Supabase client (no SDK — the official supabase-js needs Node >=22,
 * but this toolchain is Node 16). Talks to PostgREST (`/rest/v1`) and GoTrue
 * auth (`/auth/v1`) directly over fetch. The anon key is public; requests are
 * authorised with the signed-in user's access token so row-level security sees
 * `auth.uid()`.
 */
export const SUPABASE_URL: string | undefined = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Whether Supabase is configured. When false, the app stays fully local. */
export const supabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const SESSION_KEY = 'budgetos.supabase.session';

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch seconds
  user: { id: string; email: string | null };
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session | null): void {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
}

function authHeaders(token?: string): Record<string, string> {
  return {
    apikey: SUPABASE_ANON_KEY ?? '',
    Authorization: `Bearer ${token ?? SUPABASE_ANON_KEY ?? ''}`,
  };
}

/** POST to GoTrue and return the raw response JSON. */
async function auth(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error_description || json?.msg || json?.message || `auth ${path} failed (${res.status})`);
  return json;
}

function toSession(json: any): Session {
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (json.expires_in ?? 3600),
    user: { id: json.user?.id, email: json.user?.email ?? null },
  };
}

export async function signIn(email: string, password: string): Promise<Session> {
  const json = await auth('token?grant_type=password', { email, password });
  const s = toSession(json);
  saveSession(s);
  return s;
}

export async function signUp(email: string, password: string): Promise<Session | null> {
  const json = await auth('signup', { email, password });
  // With email confirmation on, no session is returned until the user confirms.
  if (!json.access_token) return null;
  const s = toSession(json);
  saveSession(s);
  return s;
}

export function signOut(): void {
  saveSession(null);
}

/** Refresh an expired session; returns the new session or null if refresh fails. */
export async function refresh(session: Session): Promise<Session | null> {
  try {
    const json = await auth('token?grant_type=refresh_token', { refresh_token: session.refresh_token });
    const s = toSession(json);
    saveSession(s);
    return s;
  } catch {
    saveSession(null);
    return null;
  }
}

/** A valid access token, refreshing if within 60s of expiry. */
export async function validToken(): Promise<string | null> {
  let s = loadSession();
  if (!s) return null;
  if (s.expires_at - Date.now() / 1000 < 60) {
    s = await refresh(s);
  }
  return s?.access_token ?? null;
}

/** PostgREST request helper. Returns parsed JSON (array for reads). */
export async function rest(
  method: string,
  path: string,
  opts: { body?: unknown; token?: string; representation?: boolean } = {},
): Promise<any> {
  const headers: Record<string, string> = {
    ...authHeaders(opts.token),
    'Content-Type': 'application/json',
  };
  if (opts.representation) headers.Prefer = 'return=representation';
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.message || `rest ${method} ${path} failed (${res.status})`);
  return json;
}
