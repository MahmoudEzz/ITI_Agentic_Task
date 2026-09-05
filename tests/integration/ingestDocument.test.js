import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

import { buildContainer, destroyContainer } from "../../src/infra/config/container.js";
import { createIngestDocumentUseCase } from "../../src/application/ingestion/ingestDocument.js";
import { createExtractor } from "../../src/adapters/extraction/createExtractor.js";
import { TesseractOcrAdapter } from "../../src/adapters/ocr/TesseractOcrAdapter.js";
import { CHUNKER_VERSION } from "../../src/application/chunking/chunkDocument.js";

// A stub, not the real Ollama provider — these tests exercise the ingestion
// pipeline's own logic (idempotency, status transitions, OCR detection,
// failure handling), not embedding quality (that's OllamaEmbeddingProvider's
// own integration tests). Keeping this stub means these tests run reliably
// in CI without needing a local Ollama, while still exercising a real
// Postgres and real extraction/chunking end-to-end.
function createCountingEmbeddingStub() {
  let callCount = 0;
  return {
    callCount: () => callCount,
    embed: async (texts) => {
      callCount++;
      return texts.map(() => new Array(768).fill(0));
    },
  };
}

let container, knex, documentRepository, vectorStore, dir;

before(async () => {
  container = buildContainer();
  knex = container.resolve("knex");
  documentRepository = container.resolve("documentRepository");
  vectorStore = container.resolve("vectorStore");
  dir = await mkdtemp(path.join(tmpdir(), "ingest-test-"));
});

after(async () => {
  await destroyContainer(container);
  await rm(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  await knex("chunks").delete();
  await knex("documents").delete();
});

const ocrPort = new TesseractOcrAdapter();

function makeUseCase(embeddingProvider) {
  return createIngestDocumentUseCase({ documentRepository, vectorStore, embeddingProvider, extractorFactory: createExtractor, ocrPort });
}

test("ingestDocument indexes a document end-to-end: extract, chunk, embed, index", async () => {
  const embeddingStub = createCountingEmbeddingStub();
  const ingestDocument = makeUseCase(embeddingStub);

  const filePath = path.join(dir, "jd.txt");
  await writeFile(filePath, "SUMMARY\n\nWe are hiring a backend engineer with strong distributed-systems experience.\n");

  const result = await ingestDocument({
    documentId: "test-jd-1",
    sourcePath: filePath,
    sourceFormat: "txt",
    type: "job_description",
    title: "Backend Engineer JD",
    createdBy: "test-user",
  });

  assert.equal(result.status, "indexed");
  assert.ok(result.chunkCount >= 1);

  const doc = await documentRepository.findById("test-jd-1");
  assert.equal(doc.status, "indexed");
  assert.ok(doc.contentHash);

  const chunkerVersion = await vectorStore.getChunkerVersionForDocument("test-jd-1");
  assert.equal(chunkerVersion, CHUNKER_VERSION);
});

test("re-ingesting an unchanged document is a no-op: skipped status, no new embedding calls", async () => {
  const embeddingStub = createCountingEmbeddingStub();
  const ingestDocument = makeUseCase(embeddingStub);

  const filePath = path.join(dir, "jd2.txt");
  await writeFile(filePath, "SUMMARY\n\nA role description that does not change between runs.\n");

  const params = {
    documentId: "test-jd-2",
    sourcePath: filePath,
    sourceFormat: "txt",
    type: "job_description",
    title: "Unchanging JD",
    createdBy: "test-user",
  };

  const first = await ingestDocument(params);
  assert.equal(first.status, "indexed");
  const callsAfterFirst = embeddingStub.callCount();
  assert.ok(callsAfterFirst > 0);

  const second = await ingestDocument(params);
  assert.equal(second.status, "skipped");
  assert.equal(embeddingStub.callCount(), callsAfterFirst); // no new embedding calls at all
});

test("changing the source content triggers real re-ingestion, not a skip", async () => {
  const embeddingStub = createCountingEmbeddingStub();
  const ingestDocument = makeUseCase(embeddingStub);

  const filePath = path.join(dir, "jd3.txt");
  await writeFile(filePath, "SUMMARY\n\nVersion one of this job description.\n");

  const params = {
    documentId: "test-jd-3",
    sourcePath: filePath,
    sourceFormat: "txt",
    type: "job_description",
    title: "Changing JD",
    createdBy: "test-user",
  };

  await ingestDocument(params);
  const callsAfterFirst = embeddingStub.callCount();

  await writeFile(filePath, "SUMMARY\n\nVersion two of this job description, materially different content.\n");
  const second = await ingestDocument(params);

  assert.equal(second.status, "indexed");
  assert.ok(embeddingStub.callCount() > callsAfterFirst);
});

test("a chunker-version bump forces re-chunking even when the source content is unchanged", async () => {
  const embeddingStub = createCountingEmbeddingStub();
  const ingestDocument = makeUseCase(embeddingStub);

  const filePath = path.join(dir, "jd4.txt");
  await writeFile(filePath, "SUMMARY\n\nContent that will not change across this test's two ingests.\n");

  const params = {
    documentId: "test-jd-4",
    sourcePath: filePath,
    sourceFormat: "txt",
    type: "job_description",
    title: "Stable-content JD",
    createdBy: "test-user",
  };

  await ingestDocument(params);
  const callsAfterFirst = embeddingStub.callCount();

  // Simulate a chunking-strategy upgrade by rewriting the stored
  // chunker_version to something older than the code's current CHUNKER_VERSION.
  await knex("chunks").where({ document_id: "test-jd-4" }).update({ chunker_version: "v0-old" });

  const second = await ingestDocument(params);
  assert.equal(second.status, "indexed");
  assert.ok(embeddingStub.callCount() > callsAfterFirst);

  const chunkerVersion = await vectorStore.getChunkerVersionForDocument("test-jd-4");
  assert.equal(chunkerVersion, CHUNKER_VERSION);
});

test("a truly blank scanned PDF still ends up needs_ocr after a real OCR attempt yields nothing usable", async () => {
  const embeddingStub = createCountingEmbeddingStub();
  const ingestDocument = makeUseCase(embeddingStub);

  const blankPdfPath = path.join(dir, "scanned.pdf");
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage();
  await writeFile(blankPdfPath, await pdfDoc.save());

  const result = await ingestDocument({
    documentId: "test-scanned-1",
    sourcePath: blankPdfPath,
    sourceFormat: "pdf",
    type: "cv",
    title: "Scanned CV",
    createdBy: "test-user",
    candidateId: null,
  });

  // This document genuinely goes through OcrPort.recognize() (a real
  // tesseract.js call, not a stub) — it lands on needs_ocr because a blank
  // page really does OCR to empty text, not because OCR was skipped.
  assert.equal(result.status, "needs_ocr");
  assert.equal(embeddingStub.callCount(), 0); // never even attempted to embed ungrounded OCR content

  const doc = await documentRepository.findById("test-scanned-1");
  assert.equal(doc.status, "needs_ocr");
  assert.equal(doc.ocrRequired, true);
  assert.match(doc.statusMessage, /yielded no usable text/);

  const chunkCount = (await knex("chunks").where({ document_id: "test-scanned-1" }).count("id")).at(0).count;
  assert.equal(Number(chunkCount), 0);
});

test("a real scanned CV fixture (cv-002-sara-mansour) OCRs to usable, indexed chunks tagged with page/ocrVersion/ocrConfidence", async () => {
  const embeddingStub = createCountingEmbeddingStub();
  const ingestDocument = makeUseCase(embeddingStub);
  const fixturePath = path.join(process.cwd(), "corpus", "cvs", "cv-002-sara-mansour.pdf");

  const result = await ingestDocument({
    documentId: "test-ocr-usable-1",
    sourcePath: fixturePath,
    sourceFormat: "pdf",
    type: "cv",
    title: "Sara Mansour CV (scanned)",
    createdBy: "test-user",
    candidateId: null,
  });

  assert.equal(result.status, "indexed");
  assert.ok(result.chunkCount >= 1);
  assert.ok(embeddingStub.callCount() > 0);

  const doc = await documentRepository.findById("test-ocr-usable-1");
  assert.equal(doc.status, "indexed");
  assert.equal(doc.ocrRequired, true); // permanently records that this document needed OCR

  const rows = await knex("chunks").where({ document_id: "test-ocr-usable-1" });
  assert.ok(rows.length >= 1);
  for (const row of rows) {
    assert.equal(row.page, 1);
    assert.equal(row.ocr_version, "tesseract-v1");
    assert.ok(Number(row.ocr_confidence) > 0);
  }
});

test("a real scanned CV fixture that OCRs to nothing usable at all (cv-025b, an intentionally illegible fixture) ends up needs_ocr, never partially indexed", async () => {
  const embeddingStub = createCountingEmbeddingStub();
  const ingestDocument = makeUseCase(embeddingStub);
  const fixturePath = path.join(process.cwd(), "corpus", "cvs", "cv-025-mina-abdel-malak-b.pdf");

  const result = await ingestDocument({
    documentId: "test-ocr-unusable-1",
    sourcePath: fixturePath,
    sourceFormat: "pdf",
    type: "cv",
    title: "Mina Abdel-Malak CV (illegible scan)",
    createdBy: "test-user",
    candidateId: null,
  });

  assert.equal(result.status, "needs_ocr");
  assert.equal(embeddingStub.callCount(), 0);

  const chunkCount = (await knex("chunks").where({ document_id: "test-ocr-unusable-1" }).count("id")).at(0).count;
  assert.equal(Number(chunkCount), 0);
});

test("an extraction failure is recorded as a failed status, not thrown — one bad document can't abort a batch", async () => {
  const embeddingStub = createCountingEmbeddingStub();
  const ingestDocument = makeUseCase(embeddingStub);

  const missingPath = path.join(dir, "does-not-exist.txt");

  const result = await ingestDocument({
    documentId: "test-missing-1",
    sourcePath: missingPath,
    sourceFormat: "txt",
    type: "job_description",
    title: "Missing file",
    createdBy: "test-user",
  });

  assert.equal(result.status, "failed");
  assert.ok(result.error);

  const doc = await documentRepository.findById("test-missing-1");
  assert.equal(doc.status, "failed");
  assert.ok(doc.statusMessage);
});
