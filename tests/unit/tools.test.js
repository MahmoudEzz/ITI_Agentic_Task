import { test } from "node:test";
import assert from "node:assert/strict";

import { createSearchCorpusTool } from "../../src/application/tools/searchCorpus.js";
import { createGetCandidateChunksTool } from "../../src/application/tools/getCandidateChunks.js";
import { NotFoundError } from "../../src/domain/errors/index.js";

test("searchCorpus embeds the query, calls hybridSearch, and returns schema-valid results", async () => {
  const embeddingProvider = { embed: async () => [[0.1, 0.2]] };
  const vectorStore = {
    hybridSearch: async () => [{ chunkId: "c1", documentId: "d1", content: "x", score: 0.5, denseSimilarity: 0.9 }],
  };
  const searchCorpus = createSearchCorpusTool({ vectorStore, embeddingProvider });

  const result = await searchCorpus({ query: "Kubernetes experience" });
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].chunkId, "c1");
});

test("searchCorpus rejects an invalid input against SearchCorpusInputSchema", async () => {
  const searchCorpus = createSearchCorpusTool({ vectorStore: {}, embeddingProvider: {} });
  await assert.rejects(() => searchCorpus({}));
});

const OCR_THRESHOLDS = { lowConfidenceThreshold: 70, unusableThreshold: 40 };

test("getCandidateChunks resolves candidateHandle to the internal id before filtering", async () => {
  let capturedId;
  const candidateRepository = { findByHandle: async (handle) => ({ id: handle.toLowerCase(), handle }) };
  const vectorStore = {
    findByCandidateId: async (id) => {
      capturedId = id;
      return [{ chunkId: "c1", documentId: "d1", content: "x", score: null, ocrConfidence: null }];
    },
  };
  const getCandidateChunks = createGetCandidateChunksTool({ vectorStore, candidateRepository, ocrThresholds: OCR_THRESHOLDS });

  const result = await getCandidateChunks({ candidateHandle: "CAND-001" });
  assert.equal(capturedId, "cand-001");
  assert.equal(result.chunks.length, 1);
});

test("getCandidateChunks throws NotFoundError for a handle that doesn't resolve", async () => {
  const candidateRepository = { findByHandle: async () => null };
  const getCandidateChunks = createGetCandidateChunksTool({ vectorStore: {}, candidateRepository, ocrThresholds: OCR_THRESHOLDS });

  await assert.rejects(() => getCandidateChunks({ candidateHandle: "CAND-999" }), NotFoundError);
});

test("getCandidateChunks excludes unusable-confidence OCR chunks (ADR-0004) but keeps low_confidence and native-text ones", async () => {
  const candidateRepository = { findByHandle: async (handle) => ({ id: handle.toLowerCase(), handle }) };
  const vectorStore = {
    findByCandidateId: async () => [
      { chunkId: "native", documentId: "d1", content: "x", score: null, ocrConfidence: null },
      { chunkId: "low-conf", documentId: "d1", content: "x", score: null, ocrConfidence: 55 },
      { chunkId: "unusable", documentId: "d1", content: "x", score: null, ocrConfidence: 20 },
      { chunkId: "confident", documentId: "d1", content: "x", score: null, ocrConfidence: 90 },
    ],
  };
  const getCandidateChunks = createGetCandidateChunksTool({ vectorStore, candidateRepository, ocrThresholds: OCR_THRESHOLDS });

  const result = await getCandidateChunks({ candidateHandle: "CAND-001" });
  const returnedIds = result.chunks.map((c) => c.chunkId);
  assert.deepEqual(returnedIds.sort(), ["confident", "low-conf", "native"]);
});
