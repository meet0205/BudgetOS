import { useState } from 'react';
import { signIn, signUp, type Session } from '../supabase/client.js';

/**
 * Sign-in / sign-up gate for the Supabase (cloud) backend. The user authenticates
 * here themselves — the app never stores or transmits their password beyond the
 * single GoTrue call. On success the parent switches the data layer to Supabase.
 */
export function Login({ onAuthed }: { onAuthed: (session: Session) => void }) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setNote(null);
    if (!email.trim() || !password) return setErr('Email and password are required');
    try {
      setBusy(true);
      if (mode === 'in') {
        onAuthed(await signIn(email.trim(), password));
      } else {
        const session = await signUp(email.trim(), password);
        if (session) onAuthed(session);
        else setNote('Check your email to confirm your account, then sign in.');
      }
    } catch (ex) {
      setErr(String(ex).replace(/^Error:\s*/, ''));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-name" style={{ fontSize: 20 }}>Budget</div>
          <div className="muted" style={{ fontSize: 12 }}>Sign in to sync your data</div>
        </div>

        <div className="mode-tabs" style={{ margin: '0 0 16px', display: 'flex', width: '100%' }}>
          <button type="button" className={`mode-tab ${mode === 'in' ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => { setMode('in'); setErr(null); setNote(null); }}>Sign in</button>
          <button type="button" className={`mode-tab ${mode === 'up' ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => { setMode('up'); setErr(null); setNote(null); }}>Create account</button>
        </div>

        <form className="entry-form" onSubmit={submit} style={{ gap: 12 }}>
          <label className="field grow">
            <span>Email</span>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="you@example.com" />
          </label>
          <label className="field grow">
            <span>Password</span>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} placeholder="••••••••" />
          </label>
          <button className="btn" disabled={busy}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
          {err && <p className="error">{err}</p>}
          {note && <p className="muted" style={{ color: 'var(--text-success)' }}>{note}</p>}
        </form>
      </div>
    </div>
  );
}
