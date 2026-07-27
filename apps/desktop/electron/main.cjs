/**
 * Electron main process. Hosts the BudgetOS web app in a desktop window and
 * exposes a receipt-OCR bridge that shells out to the user's *own* local Claude
 * Code CLI (`claude -p`). Claude Code authenticates with the user's subscription
 * itself — we never read or transmit any token; we just invoke the product the
 * way it's meant to be scripted. No API key.
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('node:child_process');
const { writeFileSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const isDev = !app.isPackaged;
const DEV_URL = process.env.BUDGETOS_DEV_URL || 'http://localhost:5173';

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    backgroundColor: '#f5f5f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (isDev) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

/**
 * OCR a receipt image via the local Claude Code CLI. Writes the image to a temp
 * dir, runs `claude -p` restricted to the Read tool, returns the transcription.
 */
ipcMain.handle('ocr:claude', async (_event, payload) => {
  const { base64, ext } = payload || {};
  if (!base64) throw new Error('no image data');
  const dir = mkdtempSync(path.join(tmpdir(), 'budgetos-ocr-'));
  const filename = `receipt.${(ext || 'png').replace(/[^a-z0-9]/gi, '') || 'png'}`;
  const file = path.join(dir, filename);
  try {
    writeFileSync(file, Buffer.from(base64, 'base64'));
    return await runClaude(dir, filename);
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

function runClaude(cwd, filename) {
  return new Promise((resolve, reject) => {
    const prompt =
      `Read the image file ${filename} in the current directory and transcribe the ` +
      `receipt to plain text, preserving line breaks (store name at top, item lines, ` +
      `and the TOTAL line). Output only the transcription.`;
    // One shell command string (not an args array): on Windows a shell arg-array
    // splits the quoted prompt. stdio ignores stdin so `claude -p` doesn't wait.
    const cmd = `claude -p "${prompt.replace(/"/g, '')}" --allowedTools Read`;
    const child = spawn(cmd, {
      cwd,
      shell: true, // resolve `claude`/`claude.cmd` from PATH
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Claude OCR timed out')); }, 120_000);
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(err.trim() || `claude exited with code ${code}`));
    });
  });
}
