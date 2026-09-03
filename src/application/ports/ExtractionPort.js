// Port (interface) — implemented per-format in src/adapters/extraction/.
// Every implementation returns the same shape so the ingestion use case
// never needs to know which concrete extractor produced it.
//
// Result shape: { text, pageCount, pageCountMethod, needsOcr }
//   - pageCountMethod is "actual" (PDF page count from the file itself) or
//     "estimated_500_words_per_page" (txt/docx have no native page concept —
//     see docs/BRD.md's corpus plan, which uses the same convention).
//   - needsOcr is true when a PDF's extracted text yield is too low to trust
//     (ADR-0004) — the document is flagged, not silently ingested empty.
export class ExtractionPort {
  async extract(_sourcePath) {
    throw new Error("ExtractionPort.extract not implemented");
  }
}
