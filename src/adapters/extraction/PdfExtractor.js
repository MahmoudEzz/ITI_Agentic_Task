import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { ExtractionPort } from "../../application/ports/ExtractionPort.js";
import { PDFJS_STANDARD_FONT_DATA_URL } from "../shared/pdfjsStandardFontDataUrl.js";

// Below this many extracted characters per page, a PDF is treated as
// scanned/image-only rather than trusted as-is — see ADR-0004. OCR
// (tesseract.js, Phase 5) picks it up from there; this extractor's job is
// only to detect and flag it correctly, not to silently ingest an empty or
// garbled document.
const MIN_CHARS_PER_PAGE = 50;

// Uses pdfjs-dist directly (not the `pdf-parse` wrapper) — this is the same
// library src/adapters/ocr/TesseractOcrAdapter.js uses for rasterization.
// Two different pdfjs-dist major versions loaded in the same process (as
// pdf-parse's own bundled/pinned copy would cause) trip pdfjs-dist's own
// API/Worker version check and crash; one shared copy for all PDF access
// avoids that whole class of bug, not just this instance of it.
export class PdfExtractor extends ExtractionPort {
  async extract(sourcePath) {
    const data = new Uint8Array(await readFile(sourcePath));
    const pdf = await getDocument({ data, disableFontFace: true, standardFontDataUrl: PDFJS_STANDARD_FONT_DATA_URL }).promise;

    const pageTexts = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pageTexts.push(content.items.map((item) => item.str).join(" "));
    }

    const text = pageTexts.join("\n");
    const charsPerPage = text.trim().length / pdf.numPages;

    return {
      text,
      pageCount: pdf.numPages,
      pageCountMethod: "actual",
      needsOcr: charsPerPage < MIN_CHARS_PER_PAGE,
    };
  }
}
