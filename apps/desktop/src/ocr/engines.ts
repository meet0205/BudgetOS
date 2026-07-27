import { parseReceiptText, type ParsedReceipt } from '@budgetos/core';
import { getOcrSettings } from './settings.js';

/** The native bridge exposed by the Electron preload (desktop app only). */
declare global {
  interface Window {
    budgetosNative?: {
      ocrClaude(base64: string, ext: string): Promise<string>;
      isElectron: boolean;
    };
  }
}

export const inElectron = typeof window !== 'undefined' && !!window.budgetosNative;

export interface ReceiptExtract extends ParsedReceipt {
  text: string;
  engine: string;
}

/** Run the user's selected OCR engine on a receipt file and parse the fields. */
export async function extractReceipt(file: File): Promise<ReceiptExtract> {
  const s = getOcrSettings();
  if (s.engine === 'off' || !file.type.startsWith('image/')) {
    return { merchant: null, date: null, totalMinor: null, text: '', engine: 'off' };
  }
  if (s.engine === 'claude') {
    const text = await ocrClaudeSubscription(file);
    return { ...parseReceiptText(text), text, engine: 'claude' };
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(',') + 1)); // strip the data: prefix
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Claude vision OCR via the user's own Claude Code **subscription** — routed
 * through the Electron main process, which shells out to the local `claude` CLI.
 * No API key, no token handling. Only available in the desktop (Electron) app.
 */
async function ocrClaudeSubscription(file: File): Promise<string> {
  if (!window.budgetosNative) {
    throw new Error('Claude OCR runs on your Claude Code subscription and needs the BudgetOS desktop app. Start it with: npm run electron (with the dev server running).');
  }
  const base64 = await fileToBase64(file);
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  return window.budgetosNative.ocrClaude(base64, ext);
}
