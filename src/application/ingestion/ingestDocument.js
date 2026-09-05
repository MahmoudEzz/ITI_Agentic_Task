import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { cleanText } from "./cleanText.js";
import { validateUpload } from "./validateUpload.js";
import { chunkDocument, CHUNKER_VERSION } from "../chunking/chunkDocument.js";

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

// The extract -> clean -> chunk -> embed -> index pipeline (FR-1), as one
// per-document use case. Identity is caller-supplied (`documentId`, e.g. the
// corpus manifest's own id) rather than generated here, so re-ingesting the
// same source is an update to the same row, not a duplicate — this is what
// makes idempotent re-ingestion possible at all.
//
// `extractorFactory` (format -> ExtractionPort instance, e.g. adapters/
// extraction/createExtractor.js) and `ocrPort` (an OcrPort instance, e.g.
// adapters/ocr/TesseractOcrAdapter.js) are injected rather than imported
// directly — application code depends only on the port shapes they return,
// never on the concrete adapter, per CLAUDE.md's layer rule (also enforced
// by eslint.config.js's no-restricted-imports for this directory).
export function createIngestDocumentUseCase({ documentRepository, vectorStore, embeddingProvider, extractorFactory, ocrPort, maxUploadSizeBytes }) {
  return async function ingestDocument({ documentId, sourcePath, sourceFormat, type, title, createdBy, candidateId = null }) {
    const existing = await documentRepository.findById(documentId);
    // Everything below can fail (missing/unreadable file, a bad extractor,
    // an embedding-provider outage) — the whole body is one try/catch so
    // every failure mode lands as a `failed` document status, never an
    // uncaught rejection that would abort a batch of many documents.
    try {
      const fileBuffer = await readFile(sourcePath);
      validateUpload({ sourceFormat, fileBuffer, maxSizeBytes: maxUploadSizeBytes });
      const contentHash = sha256(fileBuffer);

      if (existing && existing.contentHash === contentHash && existing.status === "indexed") {
        const existingChunkerVersion = await vectorStore.getChunkerVersionForDocument(documentId);
        if (existingChunkerVersion === CHUNKER_VERSION) {
          return { documentId, status: "skipped", reason: "unchanged content and chunker version" };
        }
        // Content is unchanged, but the chunking strategy has moved on since
        // this document was last indexed — fall through and re-chunk/re-embed.
      }

      await documentRepository.upsert({
        id: documentId,
        type,
        title,
        sourceFormat,
        createdBy,
        candidateId,
        sourcePath,
        contentHash,
        status: "processing",
      });

      const extractor = extractorFactory(sourceFormat);
      const extraction = await extractor.extract(sourcePath);

      // `chunks` accumulates [{content, section, charRange, page, ocrVersion,
      // ocrConfidence}] regardless of which path below fills it in — the
      // index/insert step at the bottom is shared, since a chunk row looks
      // identical either way (native chunks simply carry page/ocrVersion/
      // ocrConfidence as null, exactly as before this OCR path existed).
      let chunks;

      if (extraction.needsOcr) {
        // `ocrRequired` is set permanently true here and never cleared below —
        // it records that this document NEEDED OCR, distinct from `status`,
        // which tracks whether that OCR attempt actually yielded anything
        // usable (see ADR-0004's amendment: needs_ocr now means "OCR was
        // attempted and failed/unusable", not "OCR hasn't run yet").
        const { pages, ocrVersion } = await ocrPort.recognize(sourcePath);

        chunks = pages.flatMap((page) => {
          const cleaned = cleanText(page.text);
          if (cleaned.trim() === "") return []; // nothing usable on this page
          return chunkDocument(cleaned).map((chunk) => ({
            ...chunk,
            page: page.pageNumber,
            ocrVersion,
            ocrConfidence: page.confidence,
          }));
        });

        if (chunks.length === 0) {
          await documentRepository.upsert({
            id: documentId,
            type,
            title,
            sourceFormat,
            createdBy,
            candidateId,
            sourcePath,
            contentHash,
            status: "needs_ocr",
            ocrRequired: true,
            statusMessage: "OCR was attempted but yielded no usable text on any page — needs human review",
          });
          return { documentId, status: "needs_ocr" };
        }
      } else {
        const cleaned = cleanText(extraction.text);
        chunks = chunkDocument(cleaned).map((chunk) => ({ ...chunk, page: null, ocrVersion: null, ocrConfidence: null }));
      }

      const embeddings = await embeddingProvider.embed(chunks.map((c) => c.content));

      await vectorStore.deleteChunksByDocumentId(documentId);
      await vectorStore.insertChunks(
        chunks.map((chunk, i) => ({
          id: `${documentId}-chunk-${i}`,
          documentId,
          content: chunk.content,
          section: chunk.section,
          page: chunk.page,
          charRange: chunk.charRange,
          candidateId,
          documentType: type,
          chunkerVersion: CHUNKER_VERSION,
          ocrVersion: chunk.ocrVersion,
          ocrConfidence: chunk.ocrConfidence,
          embedding: embeddings[i],
        })),
      );

      await documentRepository.upsert({
        id: documentId,
        type,
        title,
        sourceFormat,
        createdBy,
        candidateId,
        sourcePath,
        contentHash,
        status: "indexed",
        ocrRequired: extraction.needsOcr ? true : undefined,
      });

      return { documentId, status: "indexed", chunkCount: chunks.length };
    } catch (error) {
      // contentHash may never have been computed (e.g. the file couldn't be
      // read at all) — documents.content_hash is NOT NULL, so fall back to
      // whatever hash is already on record, or a hash of the path itself as
      // a last resort. Either way this row is clearly marked `failed` with
      // the real error in statusMessage, not silently mis-marked as indexed.
      const fallbackContentHash = existing?.contentHash ?? sha256(Buffer.from(sourcePath));
      await documentRepository.upsert({
        id: documentId,
        type,
        title,
        sourceFormat,
        createdBy,
        candidateId,
        sourcePath,
        contentHash: fallbackContentHash,
        status: "failed",
        statusMessage: error.message,
      });
      return { documentId, status: "failed", error: error.message };
    }
  };
}
