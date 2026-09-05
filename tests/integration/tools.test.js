import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { buildContainer, destroyContainer } from "../../src/infra/config/container.js";
import { createSearchCorpusTool } from "../../src/application/tools/searchCorpus.js";
import { createGetCandidateChunksTool } from "../../src/application/tools/getCandidateChunks.js";

let container, knex, vectorStore, documentRepository, candidateRepository;

before(() => {
  container = buildContainer();
  knex = container.resolve("knex");
  vectorStore = container.resolve("vectorStore");
  documentRepository = container.resolve("documentRepository");
  candidateRepository = container.resolve("candidateRepository");
});

after(async () => {
  await destroyContainer(container);
});

beforeEach(async () => {
  await knex("chunks").delete();
  await knex("documents").delete();
  await knex("candidates").delete();
});

function uuid() {
  return crypto.randomUUID();
}

// A deterministic stand-in for a real embedding vector, matching the
// convention already established in tests/integration/repositories.test.js.
function fakeEmbedding(seed) {
  return new Array(768).fill(0).map((_, i) => Math.sin(seed + i));
}

test("searchCorpus tool returns real chunks from the live vector store", async () => {
  const docId = uuid();
  await documentRepository.create({ id: docId, type: "cv", title: "Tool test doc", sourceFormat: "txt", sourcePath: "x", contentHash: uuid(), createdBy: "test" });
  await vectorStore.insertChunks([
    { id: uuid(), documentId: docId, content: "Distributed systems and Kubernetes expertise.", documentType: "cv", chunkerVersion: "v1", embedding: fakeEmbedding(1) },
  ]);

  const searchCorpus = createSearchCorpusTool({ vectorStore, embeddingProvider: { embed: async () => [fakeEmbedding(1)] } });
  const result = await searchCorpus({ query: "Kubernetes" });

  assert.ok(result.results.length >= 1);
  assert.match(result.results[0].content, /Kubernetes/);
});

test("getCandidateChunks tool resolves a real candidateHandle and scopes results to that candidate only", async () => {
  const candidate = await candidateRepository.create({ id: "cand-tool-test", handle: "CAND-777", fullName: "Tool Test Candidate", createdBy: "test" });
  const otherCandidate = await candidateRepository.create({ id: "cand-tool-test-2", handle: "CAND-778", fullName: "Other Candidate", createdBy: "test" });
  const docId = uuid();
  await documentRepository.create({ id: docId, type: "cv", title: "d", sourceFormat: "txt", sourcePath: "x", contentHash: uuid(), createdBy: "test", candidateId: candidate.id });

  await vectorStore.insertChunks([
    { id: uuid(), documentId: docId, content: "belongs to CAND-777", documentType: "cv", chunkerVersion: "v1", candidateId: candidate.id, embedding: fakeEmbedding(2) },
    { id: uuid(), documentId: docId, content: "belongs to CAND-778", documentType: "cv", chunkerVersion: "v1", candidateId: otherCandidate.id, embedding: fakeEmbedding(3) },
  ]);

  const getCandidateChunks = createGetCandidateChunksTool({ vectorStore, candidateRepository });
  const result = await getCandidateChunks({ candidateHandle: "CAND-777" });

  assert.equal(result.chunks.length, 1);
  assert.match(result.chunks[0].content, /CAND-777/);
});
