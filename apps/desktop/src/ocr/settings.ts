/** OCR engine preference + optional Anthropic key, stored locally in the browser. */
export type OcrEngine = 'off' | 'tesseract' | 'claude';

const KEY = 'budgetos.ocr';

export interface OcrSettings {
  engine: OcrEngine;
  anthropicKey: string; // only used by the 'claude' engine; the user's own key
}

export function getOcrSettings(): OcrSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { engine: 'tesseract', anthropicKey: '', ...(JSON.parse(raw) as Partial<OcrSettings>) };
  } catch { /* ignore */ }
  return { engine: 'tesseract', anthropicKey: '' };
}

export function setOcrSettings(patch: Partial<OcrSettings>): OcrSettings {
  const next = { ...getOcrSettings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
