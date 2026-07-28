import { parseReceiptText, type ParsedReceipt } from '@budgetos/core';
import { ocrLocal } from './local.js';
import type { OcrEngine } from './settings.js';

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
  engine: OcrEngine;
}

/** Run the chosen OCR engine on a receipt image and parse the fields. */
export async function extractReceipt(file: File, engine: OcrEngine): Promise<ReceiptExtract> {
  if (engine === 'off' || !file.type.startsWith('image/')) {
    return { merchant: null, date: null, totalMinor: null, text: '', engine: 'off' };
  }
  let text = '';
  if (engine === 'local') text = await ocrLocal(file);
  else if (engine === 'claude') text = await ocrClaudeSubscription(file);
  else text = await ocrTesseract(file);
  return { ...parseReceiptText(text), text, engine };
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
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Claude vision OCR via the user's own Claude Code **subscription** — routed
 * through the Electron main process (local `claude` CLI). No API key, desktop
 * app only. Errors clearly in the browser where the local CLI isn't reachable.
 */
async function ocrClaudeSubscription(file: File): Promise<string> {
  if (!window.budgetosNative) {
    throw new Error('Claude OCR runs on your Claude Code subscription and needs the desktop app (npm run electron). In the browser it can’t reach your local Claude — use Tesseract or Local here.');
  }
  const base64 = await fileToBase64(file);
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  return window.budgetosNative.ocrClaude(base64, ext);
}
