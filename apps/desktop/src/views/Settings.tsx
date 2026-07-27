import { useState } from 'react';
import { jurisdictionsFor } from '@budgetos/core';
import type { BudgetData } from '../App.js';
import { db } from '../db.js';
import { formatDateOnly } from '../format.js';
import { getOcrSettings, setOcrSettings, type OcrEngine } from '../ocr/settings.js';
import { inElectron } from '../ocr/engines.js';

const PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];
const CURRENCIES = ['CAD', 'USD', 'EUR', 'GBP'];

export function Settings({ data, reload }: { data: BudgetData; reload: () => Promise<void> }) {
  const p = data.profile;
  const [name, setName] = useState(p.display_name ?? '');
  const [province, setProvince] = useState(p.province);
  const [monthStart, setMonthStart] = useState(String(p.month_start_day));
  const [currency, setCurrency] = useState(p.base_currency);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dirty = name !== (p.display_name ?? '') || province !== p.province ||
    monthStart !== String(p.month_start_day) || currency !== p.base_currency;

  async function save() {
    setErr(null); setSaved(false);
    const day = parseInt(monthStart, 10);
    if (!(day >= 1 && day <= 28)) return setErr('Month start day must be 1–28');
    try {
      setBusy(true);
      await db.profiles.update(db.userId, {
        display_name: name.trim() || null, province, base_currency: currency, month_start_day: day,
      });
      await reload();
      setSaved(true);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  const taxYear = new Date().getFullYear();
  const jur = jurisdictionsFor(taxYear, province);

  return (
    <div className="view">
      <header className="view-head">
        <h1>Settings</h1>
        <p className="muted">Region and period drive tax jurisdiction and reporting boundaries.</p>
      </header>

      <section className="panel">
        <div className="panel-head"><h2>Profile & region</h2></div>
        <div className="settings-grid">
          <Field label="Display name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </Field>
          <Field label="Province" hint="Sets the tax jurisdiction">
            <select className="input" value={province} onChange={(e) => setProvince(e.target.value)}>
              {PROVINCES.map((pr) => <option key={pr} value={pr}>{pr}</option>)}
            </select>
          </Field>
          <Field label="Month start day" hint="1 = calendar month; use your pay cycle otherwise">
            <input className="input narrow" value={monthStart} inputMode="numeric" onChange={(e) => setMonthStart(e.target.value)} />
          </Field>
          <Field label="Base currency">
            <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <button className="btn" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button>
          {saved && !dirty && <span className="muted" style={{ color: 'var(--text-success)' }}>Saved.</span>}
        </div>
        {err && <p className="error">{err}</p>}
      </section>

      <OcrSettings />

      <section className="panel">
        <div className="panel-head"><h2>Tax data</h2></div>
        {jur ? (
          <>
            <div className="sts-row"><span className="muted">Jurisdiction</span><span>Federal + {province} · {taxYear}</span></div>
            <div className="sts-row"><span className="muted">Rates verified</span><span>{formatDateOnly(jur.federal.verified_on)}</span></div>
            <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
              Rates are populated from CRA/provincial sources with provenance. Re-verify before relying — the Tax screen flags stale data.
            </p>
          </>
        ) : (
          <p className="muted">No verified tax data for {province} {taxYear}. Only NS 2026 is currently seeded — the Tax screen will show a prompt.</p>
        )}
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Data</h2></div>
        <div className="sts-row"><span className="muted">Storage</span><span>Local (this browser) · {data.transactions.length} transactions</span></div>
        <div style={{ marginTop: 10 }}>
          <button className="btn ghost" onClick={() => db.profiles /* no-op guard */ && resetConfirm()}>Reset local data</button>
        </div>
      </section>
    </div>
  );
}

function resetConfirm() {
  if (window.confirm('Erase all local BudgetOS data in this browser? This cannot be undone.')) {
    localStorage.removeItem('budgetos.v1');
    location.reload();
  }
}

function OcrSettings() {
  const [s, setS] = useState(getOcrSettings());
  function update(patch: Parameters<typeof setOcrSettings>[0]) { setS(setOcrSettings(patch)); }

  return (
    <section className="panel">
      <div className="panel-head"><h2>Receipt OCR</h2><span className="muted">reads dropped receipts on the Import screen</span></div>
      <div className="settings-grid">
        <Field label="Engine" hint="How receipts are read into fields">
          <select className="input" value={s.engine} onChange={(e) => update({ engine: e.target.value as OcrEngine })}>
            <option value="tesseract">On-device (Tesseract) — private, no login</option>
            <option value="claude">Claude — your subscription (desktop app)</option>
            <option value="off">Off — enter manually</option>
          </select>
        </Field>
      </div>
      <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
        {s.engine === 'tesseract' && 'On-device: the receipt never leaves your machine. Accuracy varies with photo quality.'}
        {s.engine === 'claude' && (inElectron
          ? 'Uses your Claude Code subscription via the desktop app — no API key. The receipt is read by your local Claude, then discarded.'
          : 'Claude runs on your Claude Code subscription through the desktop (Electron) app — no API key. Open BudgetOS with “npm run electron” (dev server running) for this option to work; in the browser it can’t reach your local Claude.')}
        {s.engine === 'off' && 'Auto-fill disabled; you type each receipt’s details.'}
      </p>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="settings-field">
      <span className="settings-label">{label}</span>
      {children}
      {hint && <span className="settings-hint">{hint}</span>}
    </label>
  );
}
