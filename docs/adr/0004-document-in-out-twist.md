# ADR-0004: T6 twist — OCR and document generation approach

## Status

Proposed (implemented in Phase 5; flip to Accepted once landed and tested against the scanned-CV fixtures)

## Context

T6 requires OCR of scanned PDFs with confidence handling, and a professionally formatted generated document (DOCX and/or PDF) with citations and tables. For D6, this maps naturally onto: some candidate CVs arrive as scanned PDFs with no text layer, and the shortlist deliverable itself should be a formatted report, not a chat transcript.

## Decision

**OCR**: `tesseract.js` (pure JS/WASM, fully offline, free). Pipeline: attempt native text-layer extraction first (`pdf-parse`/`pdfjs-dist`); if extraction yield is below a garbled-ratio threshold, flag the document as scanned, rasterize its pages (`pdftoppm`, installed in the Docker image), and OCR each page image, which yields per-word/line confidence scores. Chunk-level `ocrConfidence` (averaged) is stored as chunk metadata: below 70 is flagged `low_confidence` and surfaced with a visible warning at the citation/UI level rather than silently trusted; below 40 is flagged `unusable` and excluded from automatic Evidence Extractor input, forcing human review.

**Document generation**: `docx` (dolanmiu/docx) produces the primary DOCX report — a scoring matrix table per candidate/competency, citations back to `sourceChunkId`/document/page, and the interview-probes section. A **Puppeteer HTML→PDF** path renders the same report content as a PDF twin. Both formats are generated only after the hiring manager approves or edits-and-approves the shortlist — `generate_report` is a gated write tool, never executed speculatively.

## Alternatives considered

- **A cloud OCR API (e.g. Google Vision, AWS Textract)** — likely higher accuracy, but reintroduces a paid/hosted dependency the brief explicitly designs against, and moves candidate PII off-infrastructure for a capability that has a free, offline equivalent. Rejected in favor of `tesseract.js`; the accuracy trade-off is disclosed candidly in `docs/EVALUATION.md` and `docs/SECURITY.md` rather than hidden.
- **DOCX-only output** — would satisfy the "DOCX/PDF" wording literally with less effort; superseded by a deliberate decision to build both formats from one report-content model, since the incremental cost of an HTML→PDF render on top of an already-structured report is modest.
- **A dedicated PDF library (pdf-lib) instead of Puppeteer** — pdf-lib gives lower-level control but requires hand-laying-out tables/text; Puppeteer-from-HTML reuses ordinary CSS for table/citation formatting, which is faster to build and easier to keep visually consistent with the DOCX version's structure.

## Consequences

- OCR confidence thresholds (70/40) are stated as provisional in `docs/BRD.md` until real OCR output exists on the synthetic scanned-CV fixtures (Phase 5); the tuning process, not just the final numbers, is documented.
- Puppeteer requires a headless Chromium in the Docker image, adding image size/build time — accepted as a reasonable cost for genuinely producing both formats; noted candidly in `docs/SYSTEM-DESIGN.md` if it becomes a real friction point.
- `low_confidence` chunks still surface in citations (with the warning) rather than being silently dropped, so a hiring manager can judge for themselves — consistent with the "grounded, never guessing" principle applied to OCR uncertainty, not just LLM uncertainty.
