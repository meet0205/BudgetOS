/** OCR engine preference, stored locally in the browser. */
export type OcrEngine = 'off' | 'tesseract' | 'claude';

const KEY = 'budgetos.ocr';

export interface OcrSettings {
  engine: OcrEngine;
}

export function getOcrSettings(): OcrSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { engine: 'tesseract', ...(JSON.parse(raw) as Partial<OcrSettings>) };
  } catch { /* ignore */ }
  return { engine: 'tesseract' };
}

export function setOcrSettings(patch: Partial<OcrSettings>): OcrSettings {
  const next = { ...getOcrSettings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
