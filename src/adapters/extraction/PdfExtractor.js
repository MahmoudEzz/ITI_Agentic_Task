import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";
import { ExtractionPort } from "../../application/ports/ExtractionPort.js";

// Below this many extracted characters per page, a PDF is treated as
// scanned/image-only rather than trusted as-is — see ADR-0004. Actual OCR
// (tesseract.js) is Phase 5; this extractor's job is only to detect and flag
// it correctly, not to silently ingest an empty or garbled document.
const MIN_CHARS_PER_PAGE = 50;

export class PdfExtractor extends ExtractionPort {
  async extract(sourcePath) {
    const buffer = await readFile(sourcePath);
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      const pageCount = result.total || 1;
      const charsPerPage = result.text.trim().length / pageCount;

      return {
        text: result.text,
        pageCount,
        pageCountMethod: "actual",
        needsOcr: charsPerPage < MIN_CHARS_PER_PAGE,
      };
    } finally {
      await parser.destroy();
    }
  }
}
