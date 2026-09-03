import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { buildContainer, destroyContainer } from "../../src/infra/config/container.js";

let container;
let knex;

before(() => {
  container = buildContainer();
  knex = container.resolve("knex");
});

after(async () => {
  await destroyContainer(container);
});

beforeEach(async () => {
  // FK order matters: chunks -> documents/candidates.
  await knex("chunks").delete();
  await knex("documents").delete();
  await knex("candidates").delete();
});

function uuid() {
  return crypto.randomUUID();
}

test("KnexDocumentRepository: create, findById, findByContentHash round-trip", async () => {
  const repo = container.resolve("documentRepository");
  const id = uuid();
  const contentHash = "hash-" + uuid();

  const created = await repo.create({
    id,
    type: "job_description",
    title: "Backend Engineer",
    sourceFormat: "txt",
    sourcePath: "corpus/job-descriptions/backend.txt",
    contentHash,
    createdBy: "test-user",
  });

  assert.equal(created.id, id);
  assert.equal(created.status, "pending");

  const byId = await repo.findById(id);
  assert.equal(byId.title, "Backend Engineer");

  const byHash = await repo.findByContentHash(contentHash);
  assert.equal(byHash.id, id);
});

test("KnexDocumentRepository.findByContentHash returns null for an unseen hash — this is what makes re-ingestion idempotent", async () => {
  const repo = container.resolve("documentRepository");
  const result = await repo.findByContentHash("never-seen-hash");
  assert.equal(result, null);
});

test("KnexDocumentRepository.updateStatus persists status and message", async () => {
  const repo = container.resolve("documentRepository");
  const id = uuid();
  await repo.create({
    id,
    type: "cv",
    title: "A CV",
    sourceFormat: "pdf",
    sourcePath: "corpus/cvs/a.pdf",
    contentHash: uuid(),
    createdBy: "test-user",
    candidateId: null,
  });

  const updated = await repo.updateStatus(id, "failed", "extraction yielded 0 characters");
  assert.equal(updated.status, "failed");
  assert.equal(updated.statusMessage, "extraction yielded 0 characters");
});

test("KnexCandidateRepository: create and findByHandle", async () => {
  const repo = container.resolve("candidateRepository");
  const id = uuid();
  await repo.create({ id, handle: "CAND-01", fullName: "Test Candidate", createdBy: "test-user" });

  const found = await repo.findByHandle("CAND-01");
  assert.equal(found.id, id);
  assert.equal(found.fullName, "Test Candidate");
});

function fakeEmbedding(seed) {
  // Deterministic 768-dim vector so cosine similarity is predictable in tests.
  const v = new Array(768).fill(0);
  v[seed % 768] = 1;
  return v;
}

test("PgVectorStore.searchByEmbedding ranks the closest vector first", async () => {
  const documentRepo = container.resolve("documentRepository");
  const vectorStore = container.resolve("vectorStore");
  const docId = uuid();
  await documentRepo.create({
    id: docId,
    type: "cv",
    title: "Vector test doc",
    sourceFormat: "txt",
    sourcePath: "x",
    contentHash: uuid(),
    createdBy: "test-user",
  });

  await vectorStore.insertChunks([
    { id: uuid(), documentId: docId, content: "close match", documentType: "cv", chunkerVersion: "v1", embedding: fakeEmbedding(1) },
    { id: uuid(), documentId: docId, content: "far match", documentType: "cv", chunkerVersion: "v1", embedding: fakeEmbedding(500) },
  ]);

  const results = await vectorStore.searchByEmbedding(fakeEmbedding(1), { topK: 2 });
  assert.equal(results.length, 2);
  assert.equal(results[0].content, "close match");
  assert.ok(results[0].score > results[1].score);
});

test("PgVectorStore.searchByKeyword finds a lexical match via full-text search", async () => {
  const documentRepo = container.resolve("documentRepository");
  const vectorStore = container.resolve("vectorStore");
  const docId = uuid();
  await documentRepo.create({
    id: docId,
    type: "cv",
    title: "Keyword test doc",
    sourceFormat: "txt",
    sourcePath: "x",
    contentHash: uuid(),
    createdBy: "test-user",
  });

  await vectorStore.insertChunks([
    { id: uuid(), documentId: docId, content: "Experienced with Kubernetes and Docker orchestration.", documentType: "cv", chunkerVersion: "v1", embedding: fakeEmbedding(1) },
    { id: uuid(), documentId: docId, content: "Skilled in watercolor painting and pottery.", documentType: "cv", chunkerVersion: "v1", embedding: fakeEmbedding(2) },
  ]);

  const results = await vectorStore.searchByKeyword("Kubernetes", { topK: 5 });
  assert.equal(results.length, 1);
  assert.match(results[0].content, /Kubernetes/);
});

test("PgVectorStore.hybridSearch fuses dense and keyword results via reciprocal rank", async () => {
  const documentRepo = container.resolve("documentRepository");
  const vectorStore = container.resolve("vectorStore");
  const docId = uuid();
  await documentRepo.create({
    id: docId,
    type: "cv",
    title: "Hybrid test doc",
    sourceFormat: "txt",
    sourcePath: "x",
    contentHash: uuid(),
    createdBy: "test-user",
  });

  await vectorStore.insertChunks([
    { id: uuid(), documentId: docId, content: "Kubernetes orchestration expert.", documentType: "cv", chunkerVersion: "v1", embedding: fakeEmbedding(1) },
    { id: uuid(), documentId: docId, content: "Unrelated content about gardening.", documentType: "cv", chunkerVersion: "v1", embedding: fakeEmbedding(700) },
  ]);

  const results = await vectorStore.hybridSearch("Kubernetes", fakeEmbedding(1), { topK: 5 });
  assert.ok(results.length >= 1);
  assert.match(results[0].content, /Kubernetes/);
});

test("PgVectorStore.deleteChunksByDocumentId removes exactly that document's chunks", async () => {
  const documentRepo = container.resolve("documentRepository");
  const vectorStore = container.resolve("vectorStore");
  const docId = uuid();
  const otherDocId = uuid();
  await documentRepo.create({ id: docId, type: "cv", title: "Doc A", sourceFormat: "txt", sourcePath: "x", contentHash: uuid(), createdBy: "u" });
  await documentRepo.create({ id: otherDocId, type: "cv", title: "Doc B", sourceFormat: "txt", sourcePath: "x", contentHash: uuid(), createdBy: "u" });

  await vectorStore.insertChunks([
    { id: uuid(), documentId: docId, content: "belongs to A", documentType: "cv", chunkerVersion: "v1", embedding: fakeEmbedding(1) },
    { id: uuid(), documentId: otherDocId, content: "belongs to B", documentType: "cv", chunkerVersion: "v1", embedding: fakeEmbedding(2) },
  ]);

  await vectorStore.deleteChunksByDocumentId(docId);

  const remaining = await knex("chunks").select("*");
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].document_id, otherDocId);
});
