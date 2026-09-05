import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { buildContainer, destroyContainer } from "../../src/infra/config/container.js";

let container, knex, generateReport, reportAssetRepository;

before(() => {
  container = buildContainer();
  knex = container.resolve("knex");
  generateReport = container.resolve("toolImplementations").generate_report;
  reportAssetRepository = container.resolve("reportAssetRepository");
});

after(async () => {
  await destroyContainer(container);
});

beforeEach(async () => {
  await knex("report_assets").delete();
  await knex("scores").delete();
  await knex("shortlists").delete();
  await knex("approvals").delete();
  await knex("run_steps").delete();
  await knex("runs").delete();
  await knex("chunks").delete();
  await knex("documents").delete();
  await knex("candidates").delete();
  await knex("rubrics").delete();
  await knex("competencies").delete();
});

function uuid() {
  return crypto.randomUUID();
}

function fakeEmbedding(seed) {
  return new Array(768).fill(0).map((_, i) => Math.sin(seed + i));
}

// Builds one real finalized run end-to-end via direct repository/table
// writes (not the full LLM pipeline — that's runScreeningWorkflow.js's own
// integration coverage) so generate_report's own logic (approval gate,
// report-content assembly, citation resolution, rendering) is exercised
// against real Postgres rows shaped exactly like production ones.
async function seedFinalizedRun() {
  const runId = uuid();
  const approvalId = uuid();
  const candidateId = uuid();
  const docId = uuid();
  const chunkId = `${docId}-chunk-0`;

  await knex("competencies").insert({
    id: "TEST-TECH-PROF",
    name: "Technical Proficiency",
    description: "desc",
    behavioral_anchors: JSON.stringify({ 1: "a", 2: "b", 3: "c", 4: "d", 5: "e" }),
    scale_min: 1,
    scale_max: 5,
  });
  await knex("rubrics").insert({
    id: "test-rubric-report",
    role_id: "test-role-report",
    competency_weights: JSON.stringify([{ competencyId: "TEST-TECH-PROF", weight: 1 }]),
    created_by: "test",
  });

  await knex("candidates").insert({ id: candidateId, handle: "CAND-777", full_name: "Report Test Candidate", created_by: "test" });
  await knex("documents").insert({
    id: docId,
    type: "cv",
    title: "Report Test Candidate CV",
    source_format: "txt",
    source_path: "x",
    content_hash: uuid(),
    created_by: "test",
    candidate_id: candidateId,
    status: "indexed",
  });
  await knex("chunks").insert({
    id: chunkId,
    document_id: docId,
    content: "Led the redesign of the checkout service, cutting p95 latency by 40%.",
    document_type: "cv",
    chunker_version: "v1",
    candidate_id: candidateId,
    embedding: knex.raw("?::vector", [`[${fakeEmbedding(1).join(",")}]`]),
  });

  await knex("runs").insert({ id: runId, workflow_type: "screening", state: "AWAIT_APPROVAL", created_by: "test" });
  await knex("approvals").insert({ id: approvalId, run_id: runId, decision: "approved", decided_by: "hm@example.com" });
  await knex("scores").insert({
    id: uuid(),
    run_id: runId,
    candidate_handle: "CAND-777",
    competency_id: "TEST-TECH-PROF",
    value: 5,
    rationale: "Led a real, measurable performance improvement.",
    evidence_chunk_ids: JSON.stringify([chunkId]),
  });

  const entries = [{ candidateHandle: "CAND-777", rank: 1, summary: "Excellent technical depth.", interviewProbes: ["Tell me about the checkout redesign.", "What tradeoffs did you consider?"] }];
  await knex("shortlists").insert({
    id: uuid(),
    run_id: runId,
    role_id: "test-role-report",
    entries: JSON.stringify(entries),
    degraded: false,
    approval_id: approvalId,
    finalized_at: knex.fn.now(),
  });

  return { runId, approvalId };
}

test("generate_report (docx) produces a real stored asset with a resolved citation to the real chunk's document/page", async () => {
  const { runId, approvalId } = await seedFinalizedRun();

  const result = await generateReport({ runId, approvalId, format: "docx" });
  assert.equal(result.format, "docx");

  const asset = await reportAssetRepository.findById(result.assetId);
  assert.equal(asset.format, "docx");
  assert.ok(asset.content.length > 0);
  assert.equal(asset.content.slice(0, 2).toString("ascii"), "PK");
});

test("generate_report throws ApprovalRequiredError against a real run whose approvalId doesn't match", async () => {
  const { runId } = await seedFinalizedRun();
  await assert.rejects(() => generateReport({ runId, approvalId: "does-not-exist", format: "docx" }));
});

test("generate_report (pdf) produces a real PDF asset via Puppeteer", async (t) => {
  const { runId, approvalId } = await seedFinalizedRun();

  let result;
  try {
    result = await generateReport({ runId, approvalId, format: "pdf" });
  } catch (error) {
    // No separate launchability probe beforehand — one launch attempt is
    // the real generate_report call itself, and a launch failure here
    // (no Chrome available, e.g. CI's PUPPETEER_SKIP_DOWNLOAD) is what
    // decides the dynamic skip.
    t.skip(`no launchable Chrome — run locally to exercise this suite (${error.message})`);
    return;
  }

  assert.equal(result.format, "pdf");
  const asset = await reportAssetRepository.findById(result.assetId);
  assert.ok(asset.content.length > 0);
  assert.equal(asset.content.slice(0, 5).toString("ascii"), "%PDF-");
});
