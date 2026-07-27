/**
 * Preload bridge — the only surface the web app can touch. Exposes a single,
 * narrow OCR method; no Node or filesystem access leaks to the renderer.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('budgetosNative', {
  /** Transcribe a receipt image via the local Claude Code subscription. */
  ocrClaude: (base64, ext) => ipcRenderer.invoke('ocr:claude', { base64, ext }),
  isElectron: true,
});
