import { parseReceiptText, type ParsedReceipt } from '@budgetos/core';
import { getOcrSettings } from './settings.js';

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
    if (!s.anthropicKey) throw new Error('Claude OCR needs an Anthropic API key (set it in Settings).');
    const text = await ocrClaude(file, s.anthropicKey);
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

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

/**
 * Claude vision OCR. Calls the Anthropic API directly from the browser with the
 * user's own key (there is no subscription-OAuth path for third-party apps).
 * Asks the model to transcribe the receipt so the shared parser handles both
 * engines uniformly.
 */
async function ocrClaude(file: File, apiKey: string): Promise<string> {
  const data = await fileToBase64(file);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: file.type, data } },
          { type: 'text', text: 'Transcribe this receipt to plain text, preserving line breaks (store name at top, item lines, and the TOTAL line). Output only the transcription.' },
        ],
      }],
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message || `Claude OCR failed (${res.status})`);
  return json?.content?.[0]?.text ?? '';
}
