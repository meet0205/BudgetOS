import { parseReceiptText, type ParsedReceipt } from '@budgetos/core';
import { getOcrSettings } from './settings.js';

export interface ReceiptExtract extends ParsedReceipt {
  text: string;
  engine: string;
}

/** Run on-device OCR on a receipt image and parse the fields. Works on any platform. */
export async function extractReceipt(file: File): Promise<ReceiptExtract> {
  const s = getOcrSettings();
  if (s.engine === 'off' || !file.type.startsWith('image/')) {
    return { merchant: null, date: null, totalMinor: null, text: '', engine: 'off' };
  }
  const text = await ocrTesseract(file);
  return { ...parseReceiptText(text), text, engine: 'tesseract' };
}

/** On-device OCR via Tesseract (WASM). Loaded on demand — the engine is large. */
async function ocrTesseract(file: File): Promise<string> {
  const { default: Tesseract } = await import('tesseract.js');
  const { data } = await Tesseract.recognize(file, 'eng');
  return data.text ?? '';
}
