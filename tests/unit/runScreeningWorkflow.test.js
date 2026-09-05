import { test } from "node:test";
import assert from "node:assert/strict";

import { createRunScreeningWorkflowUseCase } from "../../src/application/workflows/runScreeningWorkflow.js";
import { StructuredOutputError, InsufficientEvidenceError, NotFoundError, DomainError } from "../../src/domain/errors/index.js";

const RUBRIC = { id: "rubric-x", roleId: "backend-engineer", competencyWeights: [{ competencyId: "TECH-PROF", weight: 1 }] };

function stubRunRepository() {
  const steps = [];
  return {
    steps,
    create: async (run) => {
      steps.push(run.state);
      return run;
    },
    transitionTo: async (_runId, state, options) => {
      steps.push(state);
      return { id: _runId, state, note: options?.note ?? null };
    },
  };
}

function stubScoreRepository() {
  const calls = [];
  return { calls, createMany: async (runId, candidateHandle, scores) => calls.push({ runId, candidateHandle, scores }) };
}

function stubBiasAuditLogRepository() {
  const calls = [];
  return { calls, createMany: async (runId, auditEntries) => calls.push({ runId, auditEntries }) };
}

function stubShortlistRepository() {
  const created = [];
  return {
    created,
    create: async (shortlist) => {
      created.push(shortlist);
      return shortlist;
    },
  };
}

function makeDeps({ extractRedactScore, shortlistDrafter }) {
  return {
    runRepository: stubRunRepository(),
    scoreRepository: stubScoreRepository(),
    biasAuditLogRepository: stubBiasAuditLogRepository(),
    shortlistRepository: stubShortlistRepository(),
    rubricRepository: { findById: async (id) => (id === RUBRIC.id ? RUBRIC : null) },
    extractRedactScore,
    shortlistDrafter,
  };
}

const GOOD_SCORE = { competencyId: "TECH-PROF", value: 4, rationale: "x", evidenceChunkIds: ["c1"] };

test("happy path: reaches AWAIT_APPROVAL via the real (non-degraded) FSM sequence", async () => {
  const extractRedactScore = async () => ({ scores: [GOOD_SCORE], auditEntries: [{ sourceChunkId: "c1", category: "gender", action: "redact" }] });
  const shortlistDrafter = async ({ candidates }) => ({
    shortlist: candidates.map((c, i) => ({ candidateHandle: c.candidateHandle, rank: i + 1, summary: "ok", interviewProbes: ["a", "b"] })),
  });
  const deps = makeDeps({ extractRedactScore, shortlistDrafter });
  const runScreeningWorkflow = createRunScreeningWorkflowUseCase(deps);

  const result = await runScreeningWorkflow({
    roleId: "backend-engineer",
    rubricId: "rubric-x",
    candidateHandles: ["CAND-001", "CAND-002"],
    createdBy: "test",
  });

  assert.equal(result.degraded, false);
  assert.equal(result.run.state, "AWAIT_APPROVAL");
  assert.deepEqual(deps.runRepository.steps, [
    "INGEST_CONTEXT",
    "EXTRACT_EVIDENCE",
    "REDACT_PROTECTED_ATTRS",
    "SCORE_RUBRIC",
    "DRAFT_SHORTLIST",
    "AWAIT_APPROVAL",
  ]);
  assert.equal(deps.shortlistRepository.created[0].degraded, false);
  assert.equal(deps.biasAuditLogRepository.calls.length, 2); // once per candidate
  // Regression guard: caught for real against a live Postgres — scores
  // don't carry their own candidateHandle (RubricScorerOutputSchema is
  // scoped to one candidate per call), so it must be passed as a separate
  // argument, not read off each score object (which would insert NULL).
  assert.equal(deps.scoreRepository.calls.length, 2);
  assert.deepEqual(
    deps.scoreRepository.calls.map((c) => c.candidateHandle).sort(),
    ["CAND-001", "CAND-002"],
  );
});

test("onEvent fires started/completed progress events per candidate — the mechanism behind Phase 7's SSE discrete-progress-event routes", async () => {
  const extractRedactScore = async () => ({ scores: [GOOD_SCORE], auditEntries: [] });
  const shortlistDrafter = async ({ candidates }) => ({
    shortlist: candidates.map((c, i) => ({ candidateHandle: c.candidateHandle, rank: i + 1, summary: "ok", interviewProbes: ["a", "b"] })),
  });
  const deps = makeDeps({ extractRedactScore, shortlistDrafter });
  const runScreeningWorkflow = createRunScreeningWorkflowUseCase(deps);

  const events = [];
  await runScreeningWorkflow({
    roleId: "backend-engineer",
    rubricId: "rubric-x",
    candidateHandles: ["CAND-001", "CAND-002"],
    createdBy: "test",
    onEvent: (event) => events.push(event.type),
  });

  const candidateEvents = events.filter((t) => t.startsWith("candidate.extract_redact_score"));
  assert.deepEqual(candidateEvents, [
    "candidate.extract_redact_score.started",
    "candidate.extract_redact_score.completed",
    "candidate.extract_redact_score.started",
    "candidate.extract_redact_score.completed",
  ]);
});

test("DEGRADED_DRAFT: a candidate's StructuredOutputError degrades the whole batch, survivors still get a shortlist", async () => {
  const extractRedactScore = async ({ candidateHandle }) => {
    if (candidateHandle === "CAND-002") throw new StructuredOutputError("model gave up", { attempts: 3, lastRawOutput: "{}" });
    return { scores: [GOOD_SCORE], auditEntries: [] };
  };
  const shortlistDrafter = async () => {
    throw new Error("should never be called — DEGRADED_DRAFT bypasses the Shortlist Drafter entirely");
  };
  const deps = makeDeps({ extractRedactScore, shortlistDrafter });
  const runScreeningWorkflow = createRunScreeningWorkflowUseCase(deps);

  const result = await runScreeningWorkflow({ roleId: "backend-engineer", rubricId: "rubric-x", candidateHandles: ["CAND-001", "CAND-002"], createdBy: "test" });

  assert.equal(result.degraded, true);
  assert.equal(result.run.state, "AWAIT_APPROVAL");
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].candidateHandle, "CAND-002");
  assert.deepEqual(deps.runRepository.steps, ["INGEST_CONTEXT", "EXTRACT_EVIDENCE", "DEGRADED_DRAFT", "AWAIT_APPROVAL"]);
  const shortlist = deps.shortlistRepository.created[0];
  assert.equal(shortlist.degraded, true);
  assert.equal(shortlist.entries.length, 1);
  assert.equal(shortlist.entries[0].candidateHandle, "CAND-001");
});

test("DEGRADED_DRAFT: InsufficientEvidenceError (redaction wiped all evidence) also degrades, not FAILED", async () => {
  const extractRedactScore = async ({ candidateHandle }) => {
    if (candidateHandle === "CAND-002") throw new InsufficientEvidenceError("nothing left after redaction");
    return { scores: [GOOD_SCORE], auditEntries: [] };
  };
  const deps = makeDeps({ extractRedactScore, shortlistDrafter: async () => ({ shortlist: [] }) });
  const runScreeningWorkflow = createRunScreeningWorkflowUseCase(deps);

  const result = await runScreeningWorkflow({ roleId: "backend-engineer", rubricId: "rubric-x", candidateHandles: ["CAND-001", "CAND-002"], createdBy: "test" });

  assert.equal(result.degraded, true);
  assert.equal(deps.runRepository.steps.at(-2), "DEGRADED_DRAFT");
});

test("DEGRADED_DRAFT: the Shortlist Drafter itself failing after clean per-candidate scoring still reaches AWAIT_APPROVAL", async () => {
  const extractRedactScore = async () => ({ scores: [GOOD_SCORE], auditEntries: [] });
  const shortlistDrafter = async () => {
    throw new StructuredOutputError("drafter gave up", { attempts: 3, lastRawOutput: "{}" });
  };
  const deps = makeDeps({ extractRedactScore, shortlistDrafter });
  const runScreeningWorkflow = createRunScreeningWorkflowUseCase(deps);

  const result = await runScreeningWorkflow({ roleId: "backend-engineer", rubricId: "rubric-x", candidateHandles: ["CAND-001"], createdBy: "test" });

  assert.equal(result.degraded, true);
  // Reached DRAFT_SHORTLIST (clean scoring succeeded) before degrading — a
  // real proof this is a different failure point than the batch-level one.
  assert.deepEqual(deps.runRepository.steps, [
    "INGEST_CONTEXT",
    "EXTRACT_EVIDENCE",
    "REDACT_PROTECTED_ATTRS",
    "SCORE_RUBRIC",
    "DRAFT_SHORTLIST",
    "DEGRADED_DRAFT",
    "AWAIT_APPROVAL",
  ]);
});

test("transitions to FAILED and throws when every candidate fails — nothing to shortlist", async () => {
  const extractRedactScore = async () => {
    throw new StructuredOutputError("always fails", { attempts: 3, lastRawOutput: "{}" });
  };
  const deps = makeDeps({ extractRedactScore, shortlistDrafter: async () => ({ shortlist: [] }) });
  const runScreeningWorkflow = createRunScreeningWorkflowUseCase(deps);

  await assert.rejects(
    () => runScreeningWorkflow({ roleId: "backend-engineer", rubricId: "rubric-x", candidateHandles: ["CAND-001"], createdBy: "test" }),
    DomainError,
  );
  assert.equal(deps.runRepository.steps.at(-1), "FAILED");
});

test("a genuine bug (not StructuredOutputError/InsufficientEvidenceError) propagates instead of being swallowed as a degradation", async () => {
  const extractRedactScore = async () => {
    throw new TypeError("cannot read property of undefined");
  };
  const deps = makeDeps({ extractRedactScore, shortlistDrafter: async () => ({ shortlist: [] }) });
  const runScreeningWorkflow = createRunScreeningWorkflowUseCase(deps);

  await assert.rejects(
    () => runScreeningWorkflow({ roleId: "backend-engineer", rubricId: "rubric-x", candidateHandles: ["CAND-001"], createdBy: "test" }),
    TypeError,
  );
});

test("throws NotFoundError for an unknown rubricId", async () => {
  const deps = makeDeps({ extractRedactScore: async () => ({ scores: [], auditEntries: [] }), shortlistDrafter: async () => ({ shortlist: [] }) });
  const runScreeningWorkflow = createRunScreeningWorkflowUseCase(deps);

  await assert.rejects(
    () => runScreeningWorkflow({ roleId: "x", rubricId: "not-real", candidateHandles: ["CAND-001"], createdBy: "test" }),
    NotFoundError,
  );
});

test("throws for an empty candidateHandles list", async () => {
  const deps = makeDeps({ extractRedactScore: async () => ({ scores: [], auditEntries: [] }), shortlistDrafter: async () => ({ shortlist: [] }) });
  const runScreeningWorkflow = createRunScreeningWorkflowUseCase(deps);

  await assert.rejects(() => runScreeningWorkflow({ roleId: "x", rubricId: "rubric-x", candidateHandles: [], createdBy: "test" }));
});
