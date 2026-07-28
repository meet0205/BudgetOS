/** OCR engine preference, stored locally in the browser. */
export type OcrEngine = 'off' | 'tesseract';

const KEY = 'budgetos.ocr';

export interface OcrSettings {
  engine: OcrEngine;
}

export function getOcrSettings(): OcrSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<OcrSettings>;
      // Migrate any previously-saved 'claude' choice to the on-device engine.
      return { engine: parsed.engine === 'off' ? 'off' : 'tesseract' };
    }
  } catch { /* ignore */ }
  return { engine: 'tesseract' };
}

export function setOcrSettings(patch: Partial<OcrSettings>): OcrSettings {
  const next = { ...getOcrSettings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
