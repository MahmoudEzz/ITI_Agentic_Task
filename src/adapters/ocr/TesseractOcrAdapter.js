import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas } from "@napi-rs/canvas";
import { createWorker } from "tesseract.js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import { OcrPort } from "../../application/ports/OcrPort.js";
import { PDFJS_STANDARD_FONT_DATA_URL } from "../shared/pdfjsStandardFontDataUrl.js";

// Committed trained-model data (assets/tesseract/eng.traineddata.gz), read
// from the local filesystem — NOT tesseract.js's default behavior, which
// fetches this file from a CDN (jsdelivr) on first use. Pointing `langPath`
// at a local directory is what makes ADR-0004's "fully offline" OCR claim
// actually true at runtime, not just true until the first cold start.
const here = path.dirname(fileURLToPath(import.meta.url));
const TESSERACT_LANG_PATH = path.join(here, "..", "..", "..", "assets", "tesseract");

// Bumping this forces re-OCR of already-ingested scanned documents on the
// next `npm run ingest` — same idempotent-re-ingestion mechanism as
// chunkDocument.js's CHUNKER_VERSION, keyed on the OCR engine + rasterization
// approach rather than the chunking strategy.
export const OCR_VERSION = "tesseract-v1";

// 2x scale balances OCR accuracy against per-page render/recognize time —
// see ADR-0004's rasterization-approach amendment (pdfjs-dist + @napi-rs/canvas,
// not pdftoppm: no native binary, works identically on host/CI/Docker).
const RENDER_SCALE = 2.0;

export class TesseractOcrAdapter extends OcrPort {
  async recognize(sourcePath) {
    const data = new Uint8Array(await readFile(sourcePath));
    const pdf = await getDocument({ data, disableFontFace: true, standardFontDataUrl: PDFJS_STANDARD_FONT_DATA_URL }).promise;
    const worker = await createWorker("eng", 1, { langPath: TESSERACT_LANG_PATH, cachePath: os.tmpdir() });

    try {
      const pages = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const canvas = createCanvas(viewport.width, viewport.height);

        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;

        const {
          data: { text, confidence },
        } = await worker.recognize(canvas.toBuffer("image/png"));

        pages.push({ pageNumber, text, confidence });
      }

      return { pages, ocrVersion: OCR_VERSION };
    } finally {
      await worker.terminate();
    }
  }
}
