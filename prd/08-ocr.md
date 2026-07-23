# 08 — On-Device OCR

**Priority:** P1
**Depends on:** 07
**Blocks:** 09, 11, 14

---

## Problem

Text extraction must be free, offline, and private. It runs on every document, and a cloud round-trip per receipt would make the app slow, expensive, and dependent on connectivity at exactly the moment the user is standing in a shop.

---

## Behaviour

Invisible. The user photographs something and sees structured data. OCR is the step between, and its only user-facing surface is a progress indicator and, on failure, a clear message with a retry.

---

## Mechanism

### Engine per platform

| Platform | Engine | Notes |
|---|---|---|
| iOS | Apple Vision (`VNRecognizeTextRequest`) | Accurate, fast, free, no network |
| Android | ML Kit Text Recognition v2 | Bundled model, no Play Services dependency |
| Web / Desktop | Tesseract.js | Slower; acceptable for occasional desktop import |

Behind one interface so the parser (09) never knows which ran:

```ts
interface OcrAdapter {
  recognize(image: ImageSource): Promise<OcrResult>;
  readonly engine: string;
}

interface OcrResult {
  blocks: OcrBlock[];
  meanConfidence: number;
  engine: string;
  durationMs: number;
}

interface OcrBlock {
  text: string;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
  lineIndex: number;
}
```

Bounding boxes matter downstream: 10 uses them for image-to-field highlighting, and 11 uses x-position clustering to separate the YTD column from the current column.

### Pre-processing

Applied before recognition, in order: greyscale, CLAHE for uneven lighting, Sauvola adaptive threshold for thermal paper, deskew via Hough transform.

Thermal receipts fade and curl, which defeats global thresholding. Sauvola is local and handles the gradient across a curled receipt.

### Failure handling

OCR fails on glare, extreme crumpling, and handwriting. Failure is defined as fewer than 5 blocks or mean confidence below 0.3.

On failure the document is marked `failed` with a specific reason, the user is offered retake or manual entry, and — if 14 is enabled with `image_mode` allowing it — the image is eligible for AI vision.

---

## Files

```
packages/ocr/src/
├── index.ts
├── types.ts
├── preprocess.ts
└── adapters/
    ├── vision.native.ts
    ├── mlkit.native.ts
    └── tesseract.web.ts

apps/mobile/modules/
├── expo-vision-ocr/
└── expo-mlkit-ocr/
```

---

## Acceptance criteria

- Same `OcrResult` shape from every engine
- Bounding boxes present and correct on all engines
- A typical grocery receipt processes in under 3 s on mid-range hardware
- Works fully offline
- Pre-processing measurably improves accuracy on thermal receipts
- Failure produces a specific reason, never a generic error
- Failed documents remain retryable
