import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { cleanText } from "./cleanText.js";
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
// extraction/createExtractor.js) is injected rather than imported directly —
// application code depends only on the ExtractionPort shape it returns,
// never on the concrete adapter, per CLAUDE.md's layer rule (also enforced
// by eslint.config.js's no-restricted-imports for this directory).
export function createIngestDocumentUseCase({ documentRepository, vectorStore, embeddingProvider, extractorFactory }) {
  return async function ingestDocument({ documentId, sourcePath, sourceFormat, type, title, createdBy, candidateId = null }) {
    const existing = await documentRepository.findById(documentId);
    // Everything below can fail (missing/unreadable file, a bad extractor,
    // an embedding-provider outage) — the whole body is one try/catch so
    // every failure mode lands as a `failed` document status, never an
    // uncaught rejection that would abort a batch of many documents.
    try {
      const fileBuffer = await readFile(sourcePath);
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

      if (extraction.needsOcr) {
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
        });
        return { documentId, status: "needs_ocr" };
      }

      const cleaned = cleanText(extraction.text);
      const chunks = chunkDocument(cleaned);
      const embeddings = await embeddingProvider.embed(chunks.map((c) => c.content));

      await vectorStore.deleteChunksByDocumentId(documentId);
      await vectorStore.insertChunks(
        chunks.map((chunk, i) => ({
          id: `${documentId}-chunk-${i}`,
          documentId,
          content: chunk.content,
          section: chunk.section,
          page: null,
          charRange: chunk.charRange,
          candidateId,
          documentType: type,
          chunkerVersion: CHUNKER_VERSION,
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
