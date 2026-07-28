/** OCR engine preference, stored locally in the browser. */
export type OcrEngine = 'off' | 'local' | 'tesseract' | 'claude';

export const ENGINE_LABELS: Record<OcrEngine, string> = {
  tesseract: 'Tesseract (on-device)',
  local: 'Local algorithm (basic)',
  claude: 'Claude (subscription · desktop)',
  off: 'Off — manual',
};

const KEY = 'budgetos.ocr';
const VALID = new Set<OcrEngine>(['off', 'local', 'tesseract', 'claude']);

export function getOcrSettings(): { engine: OcrEngine } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const e = (JSON.parse(raw) as { engine?: OcrEngine }).engine;
      if (e && VALID.has(e)) return { engine: e };
    }
  } catch { /* ignore */ }
  return { engine: 'tesseract' };
}

export function setOcrSettings(patch: { engine: OcrEngine }): { engine: OcrEngine } {
  const next = { ...getOcrSettings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
