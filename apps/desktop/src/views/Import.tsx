import { useState } from 'react';
import { toMinor, type Category, type TxnKind, type Minor } from '@budgetos/core';
import type { BudgetData } from '../App.js';
import { db } from '../db.js';
import { todayISODate } from '../format.js';
import { extractReceipt, inElectron } from '../ocr/engines.js';
import { getOcrSettings, ENGINE_LABELS, type OcrEngine } from '../ocr/settings.js';

type OcrStatus = 'reading' | 'done' | 'error' | null;

interface QueueItem {
  id: string;
  fileName: string;
  file: File;
  previewUrl: string | null; // in-memory object URL (images only)
  merchant: string;
  date: string;
  amount: string;
  categoryId: string;
  accountId: string;
  ocr: OcrStatus;
}

let counter = 0;

export function Import({ data, reload }: { data: BudgetData; reload: () => Promise<void> }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const txnCategories = data.categories.filter((c) => c.layer === 'transaction' && !c.is_hidden);
  const activeAccounts = data.accounts.filter((a) => !a.is_archived);
  const today = todayISODate();

  // Per-upload engine choice, seeded from the Settings default.
  const [ocrEngine, setOcrEngine] = useState<OcrEngine>(getOcrSettings().engine);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const engine = ocrEngine;
    const willOcr = engine !== 'off';
    const items: QueueItem[] = Array.from(files).map((f) => ({
      id: `q${++counter}`,
      fileName: f.name,
      file: f,
      previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
      merchant: '',
      date: today,
      amount: '',
      categoryId: '',
      accountId: activeAccounts[0]?.id ?? '',
      ocr: willOcr && f.type.startsWith('image/') ? 'reading' : null,
    }));
    setQueue((q) => [...q, ...items]);
    // Kick off OCR for each image with the chosen engine; fill fields as each finishes.
    for (const it of items) {
      if (it.ocr !== 'reading') continue;
      extractReceipt(it.file, engine)
        .then((r) => update(it.id, {
          merchant: r.merchant ?? '',
          date: r.date ?? today,
          amount: r.totalMinor != null ? (r.totalMinor / 100).toFixed(2) : '',
          ocr: 'done',
        }))
        .catch(() => update(it.id, { ocr: 'error' }));
    }
  }

  function update(id: string, patch: Partial<QueueItem>) {
    setQueue((q) => q.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  function drop(id: string) {
    setQueue((q) => {
      const it = q.find((x) => x.id === id);
      if (it?.previewUrl) URL.revokeObjectURL(it.previewUrl);
      return q.filter((x) => x.id !== id);
    });
  }

  async function commit(item: QueueItem) {
    let amt: Minor;
    try { amt = toMinor(item.amount); } catch { return; }
    if (amt <= 0) return;
    setBusy(item.id);
    try {
      const merchant = await db.merchants.resolveOnSave(db.userId, item.merchant, { defaultCategoryId: item.categoryId || null });
      await db.transactions.create({
        user_id: db.userId,
        kind: 'expense' as TxnKind,
        occurred_at: new Date(item.date + 'T12:00:00').toISOString(),
        total_minor: amt,
        base_total_minor: amt,
        account_id: item.accountId || null,
        merchant_id: merchant?.id ?? null,
        note: `Imported from ${item.fileName}`,
        splits: [{ amount_minor: amt, base_amount_minor: amt, category_id: item.categoryId || null }],
      });
      drop(item.id);
      await reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="view">
      <header className="view-head">
        <h1>Import & review</h1>
        <p className="muted">Drop receipt files, confirm the details, and post them to the ledger.</p>
      </header>

      <div className="banner" style={{ background: 'var(--bg-accent)' }}>
        <div>
          <div className="banner-title">Read receipts with</div>
          <div className="banner-sub">
            {ocrEngine === 'off' && 'Auto-fill off — you’ll enter each receipt’s details.'}
            {ocrEngine === 'local' && 'From-scratch algorithm, on your device. Best on clean/digital receipts; rough on photos.'}
            {ocrEngine === 'tesseract' && 'On-device Tesseract — private, works on any device.'}
            {ocrEngine === 'claude' && (inElectron
              ? 'Your Claude Code subscription (most accurate) — reads locally, no key.'
              : 'Claude needs the desktop app — in the browser, pick Tesseract or Local instead.')}
          </div>
        </div>
        <select className="input" value={ocrEngine} onChange={(e) => setOcrEngine(e.target.value as OcrEngine)} style={{ flexShrink: 0 }}>
          <option value="tesseract">{ENGINE_LABELS.tesseract}</option>
          <option value="local">{ENGINE_LABELS.local}</option>
          <option value="claude">{ENGINE_LABELS.claude}</option>
          <option value="off">{ENGINE_LABELS.off}</option>
        </select>
      </div>

      <label
        className="dropzone"
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
      >
        <input type="file" accept="image/*,application/pdf" multiple style={{ display: 'none' }} onChange={(e) => addFiles(e.target.files)} />
        <div className="dropzone-inner">
          <div style={{ fontSize: 22 }}>⬇</div>
          <div style={{ fontWeight: 500 }}>Drop receipts here, or click to choose files</div>
          <div className="muted" style={{ fontSize: 11 }}>Images and PDFs · kept in this session for reference</div>
        </div>
      </label>

      {queue.length > 0 && (
        <section className="panel" style={{ marginTop: 14 }}>
          <div className="panel-head"><h2>Review queue</h2><span className="muted">{queue.length} to review</span></div>
          <div className="import-list">
            {queue.map((it) => (
              <div className="import-row" key={it.id}>
                {it.previewUrl
                  ? <img src={it.previewUrl} alt={it.fileName} className="import-thumb" />
                  : <div className="import-thumb import-thumb-doc">PDF</div>}
                <div className="import-fields">
                  <div className="import-file muted">
                    {it.fileName}
                    {it.ocr === 'reading' && <span className="chip" style={{ marginLeft: 8 }}>reading…</span>}
                    {it.ocr === 'done' && <span className="chip" style={{ marginLeft: 8, background: 'var(--bg-success)', color: 'var(--text-success)' }}>auto-filled</span>}
                    {it.ocr === 'error' && <span className="chip" style={{ marginLeft: 8, background: 'var(--bg-danger)', color: 'var(--text-danger)' }}>OCR failed</span>}
                  </div>
                  <div className="import-grid">
                    <input className="input" placeholder="Merchant" value={it.merchant} onChange={(e) => update(it.id, { merchant: e.target.value })} />
                    <input className="input" type="date" value={it.date} onChange={(e) => update(it.id, { date: e.target.value })} />
                    <input className="input" placeholder="$0.00" value={it.amount} inputMode="decimal" onChange={(e) => update(it.id, { amount: e.target.value })} />
                    <CategorySelect value={it.categoryId} onChange={(v) => update(it.id, { categoryId: v })} categories={txnCategories} />
                    <select className="input" value={it.accountId} onChange={(e) => update(it.id, { accountId: e.target.value })}>
                      <option value="">Account…</option>
                      {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="import-actions">
                  <button className="btn" disabled={busy === it.id} onClick={() => commit(it)}>{busy === it.id ? 'Saving…' : 'Post'}</button>
                  <button className="link-btn danger" onClick={() => drop(it.id)}>Discard</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CategorySelect({ value, onChange, categories }: { value: string; onChange: (v: string) => void; categories: Category[] }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Category…</option>
      {categories.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
    </select>
  );
}
