// Port (interface) — implemented by src/adapters/ocr/. Used only for PDFs
// PdfExtractor already flagged needsOcr (ADR-0004); a text-layer PDF never
// reaches this port.
//
// Result shape: { pages: [{ pageNumber, text, confidence }], ocrVersion }
//   - confidence is tesseract's mean word confidence (0-100) for that page —
//     see Chunk.js's classifyOcrConfidence for the low_confidence/unusable
//     thresholds applied against it.
//   - ocrVersion is stamped by the adapter itself (analogous to
//     chunkDocument.js's CHUNKER_VERSION) so ingestDocument.js can persist it
//     without knowing which OCR engine produced it.
export class OcrPort {
  async recognize(_sourcePath) {
    throw new Error("OcrPort.recognize not implemented");
  }
}
