/**
 * A from-scratch, dependency-free OCR — no ML library. The pipeline is classic
 * document OCR:
 *   1. rasterise the image to a canvas and convert to grayscale
 *   2. binarise with Otsu's threshold (auto ink/paper split)
 *   3. segment text lines by the horizontal ink profile
 *   4. segment characters within a line by the vertical ink profile (wide gaps = spaces)
 *   5. recognise each glyph by template-matching against a rendered monospace font
 *
 * This works well on clean, high-contrast, roughly-upright printed text (digital
 * receipts, screenshots, sharp scans). It is deliberately simple and will be poor
 * on skewed, low-contrast phone photos — that's the honest limit of hand-written
 * OCR. Tesseract is the stronger general engine; this is the transparent one.
 */

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz$.,:%-/#&';
const CELL = 16; // template normalisation size (CELL×CELL)

let templates: { ch: string; bits: Float32Array }[] | null = null;

/** Render each glyph once to a normalised feature vector for matching. */
function buildTemplates(): { ch: string; bits: Float32Array }[] {
  const size = 32;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;
  const out: { ch: string; bits: Float32Array }[] = [];
  for (const ch of CHARS) {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000';
    ctx.font = '26px "Courier New", monospace';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillText(ch, size / 2, size / 2 + 1);
    const img = ctx.getImageData(0, 0, size, size);
    out.push({ ch, bits: normaliseGlyph(binariseRegion(img, size, size), size, size) });
  }
  return out;
}

function binariseRegion(img: ImageData, w: number, h: number): Uint8Array {
  const bin = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = img.data[i * 4]!, g = img.data[i * 4 + 1]!, b = img.data[i * 4 + 2]!;
    bin[i] = (0.299 * r + 0.587 * g + 0.114 * b) < 140 ? 1 : 0; // 1 = ink
  }
  return bin;
}

/** Downscale an ink mask to CELL×CELL average coverage (translation-normalised by bbox). */
function normaliseGlyph(bin: Uint8Array, w: number, h: number): Float32Array {
  // Tight bounding box of ink.
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (bin[y * w + x]) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const out = new Float32Array(CELL * CELL);
  if (maxX < 0) return out; // empty
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  for (let cy = 0; cy < CELL; cy++) for (let cx = 0; cx < CELL; cx++) {
    const sx0 = minX + Math.floor((cx * bw) / CELL);
    const sx1 = minX + Math.max(Math.floor(((cx + 1) * bw) / CELL), Math.floor((cx * bw) / CELL) + 1);
    const sy0 = minY + Math.floor((cy * bh) / CELL);
    const sy1 = minY + Math.max(Math.floor(((cy + 1) * bh) / CELL), Math.floor((cy * bh) / CELL) + 1);
    let ink = 0, n = 0;
    for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) { ink += bin[y * w + x] ?? 0; n++; }
    out[cy * CELL + cx] = n ? ink / n : 0;
  }
  return out;
}

function recognise(bin: Uint8Array, w: number, h: number): string {
  if (!templates) templates = buildTemplates();
  const feat = normaliseGlyph(bin, w, h);
  let best = '?', bestScore = Infinity;
  for (const t of templates) {
    let d = 0;
    for (let i = 0; i < feat.length; i++) { const diff = feat[i]! - t.bits[i]!; d += diff * diff; }
    if (d < bestScore) { bestScore = d; best = t.ch; }
  }
  return bestScore < 6 ? best : '?'; // reject very poor matches
}

async function toBinary(file: File): Promise<{ bin: Uint8Array; w: number; h: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url;
    });
    // Cap width for speed; keep it legible.
    const scale = Math.min(1, 1000 / img.width);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    // Otsu threshold on the grayscale histogram.
    const gray = new Uint8Array(w * h);
    const hist = new Array(256).fill(0);
    for (let i = 0; i < w * h; i++) {
      const v = Math.round(0.299 * data.data[i * 4]! + 0.587 * data.data[i * 4 + 1]! + 0.114 * data.data[i * 4 + 2]!);
      gray[i] = v; hist[v]++;
    }
    const total = w * h;
    let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sumB = 0, wB = 0, maxVar = -1, thresh = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (wB === 0) continue; const wF = total - wB; if (wF === 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sum - sumB) / wF;
      const v = wB * wF * (mB - mF) * (mB - mF);
      if (v > maxVar) { maxVar = v; thresh = t; }
    }
    const bin = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) bin[i] = gray[i]! < thresh ? 1 : 0;
    return { bin, w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Run the local OCR pipeline on a receipt image and return the recognised text. */
export async function ocrLocal(file: File): Promise<string> {
  const { bin, w, h } = await toBinary(file);

  // Rows with ink → group into line bands.
  const rowInk = new Array(h).fill(0);
  for (let y = 0; y < h; y++) { let s = 0; for (let x = 0; x < w; x++) s += bin[y * w + x]!; rowInk[y] = s; }
  const lines: [number, number][] = [];
  let start = -1;
  for (let y = 0; y < h; y++) {
    const on = rowInk[y] > w * 0.005;
    if (on && start < 0) start = y;
    else if (!on && start >= 0) { if (y - start >= 4) lines.push([start, y]); start = -1; }
  }
  if (start >= 0) lines.push([start, h]);

  const out: string[] = [];
  for (const [y0, y1] of lines) {
    const lh = y1 - y0;
    // Column ink within the line → character/space runs.
    const colInk = new Array(w).fill(0);
    for (let x = 0; x < w; x++) { let s = 0; for (let y = y0; y < y1; y++) s += bin[y * w + x]!; colInk[x] = s; }
    const runs: [number, number][] = [];
    let cs = -1;
    for (let x = 0; x < w; x++) {
      const on = colInk[x] > 0;
      if (on && cs < 0) cs = x;
      else if (!on && cs >= 0) { runs.push([cs, x]); cs = -1; }
    }
    if (cs >= 0) runs.push([cs, w]);

    let text = '';
    let prevEnd = -1;
    const spaceGap = Math.max(4, lh * 0.5);
    for (const [x0, x1] of runs) {
      if (x1 - x0 < 2) continue;
      if (prevEnd >= 0 && x0 - prevEnd > spaceGap) text += ' ';
      // Crop glyph.
      const gw = x1 - x0, gh = lh;
      const gb = new Uint8Array(gw * gh);
      for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) gb[y * gw + x] = bin[(y0 + y) * w + (x0 + x)]!;
      text += recognise(gb, gw, gh);
      prevEnd = x1;
    }
    if (text.trim()) out.push(text.trim());
  }
  return out.join('\n');
}
