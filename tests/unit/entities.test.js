import { test } from "node:test";
import assert from "node:assert/strict";

import { createCandidate, toOpaqueHandle } from "../../src/domain/entities/Candidate.js";
import { createDocument } from "../../src/domain/entities/Document.js";
import { createChunk, classifyOcrConfidence } from "../../src/domain/entities/Chunk.js";
import { createCompetency } from "../../src/domain/entities/Competency.js";
import { createRubric } from "../../src/domain/entities/Rubric.js";
import { createEvidence } from "../../src/domain/entities/Evidence.js";
import { createScore, compositeScore } from "../../src/domain/entities/Score.js";
import { createRun, transition, isTerminal } from "../../src/domain/entities/Run.js";
import { createApproval } from "../../src/domain/entities/Approval.js";
import { createUser } from "../../src/domain/entities/User.js";
import { ValidationError, InsufficientEvidenceError } from "../../src/domain/errors/index.js";

test("Candidate rejects a handle that doesn't match the opaque CAND-N format", () => {
  assert.throws(
    () => createCandidate({ id: "1", handle: "John Smith", fullName: "John Smith", createdBy: "u1" }),
    ValidationError,
  );
});

test("toOpaqueHandle strips fullName and createdBy, keeping only the handle", () => {
  const candidate = createCandidate({ id: "1", handle: "CAND-07", fullName: "Jane Doe", createdBy: "u1" });
  const opaque = toOpaqueHandle(candidate);
  assert.deepEqual(opaque, { handle: "CAND-07" });
  assert.equal(opaque.fullName, undefined);
});

test("Document requires a candidateId when type is cv (retrieval scoping depends on it)", () => {
  assert.throws(
    () => createDocument({ id: "d1", type: "cv", title: "Resume", sourceFormat: "pdf", createdBy: "u1" }),
    ValidationError,
  );
  assert.doesNotThrow(() =>
    createDocument({ id: "d1", type: "cv", title: "Resume", sourceFormat: "pdf", createdBy: "u1", candidateId: "c1" }),
  );
});

test("Chunk rejects an out-of-range ocrConfidence", () => {
  assert.throws(
    () =>
      createChunk({
        id: "ch1",
        documentId: "d1",
        content: "text",
        documentType: "cv",
        chunkerVersion: "v1",
        ocrConfidence: 150,
      }),
    ValidationError,
  );
});

test("classifyOcrConfidence buckets correctly against provisional thresholds", () => {
  const thresholds = { lowConfidenceThreshold: 70, unusableThreshold: 40 };
  const make = (ocrConfidence) =>
    createChunk({ id: "c", documentId: "d", content: "x", documentType: "cv", chunkerVersion: "v1", ocrConfidence });

  assert.equal(classifyOcrConfidence(make(null), thresholds), "native_text");
  assert.equal(classifyOcrConfidence(make(90), thresholds), "confident");
  assert.equal(classifyOcrConfidence(make(55), thresholds), "low_confidence");
  assert.equal(classifyOcrConfidence(make(20), thresholds), "unusable");
});

test("Competency requires exactly one behavioral anchor per scale level", () => {
  assert.throws(
    () =>
      createCompetency({
        id: "comp1",
        name: "Communication",
        description: "...",
        behavioralAnchors: { 1: "poor", 2: "fair" },
        scaleMin: 1,
        scaleMax: 5,
      }),
    ValidationError,
  );
});

test("Rubric requires competency weights to sum to exactly 1", () => {
  assert.throws(
    () =>
      createRubric({
        id: "r1",
        roleId: "role1",
        createdBy: "u1",
        competencyWeights: [
          { competencyId: "comp1", weight: 0.5 },
          { competencyId: "comp2", weight: 0.4 },
        ],
      }),
    ValidationError,
  );
  assert.doesNotThrow(() =>
    createRubric({
      id: "r1",
      roleId: "role1",
      createdBy: "u1",
      competencyWeights: [
        { competencyId: "comp1", weight: 0.6 },
        { competencyId: "comp2", weight: 0.4 },
      ],
    }),
  );
});

test("Rubric rejects a duplicate competencyId", () => {
  assert.throws(
    () =>
      createRubric({
        id: "r1",
        roleId: "role1",
        createdBy: "u1",
        competencyWeights: [
          { competencyId: "comp1", weight: 0.5 },
          { competencyId: "comp1", weight: 0.5 },
        ],
      }),
    ValidationError,
  );
});

test("Evidence with no snippets is a correct refusal (InsufficientEvidenceError), not a generic validation failure", () => {
  assert.throws(() => createEvidence({ candidateHandle: "CAND-01", competencyId: "comp1", snippets: [] }), InsufficientEvidenceError);
});

test("compositeScore computes the rubric-weighted average and requires every rubric competency to have a score", () => {
  const rubric = createRubric({
    id: "r1",
    roleId: "role1",
    createdBy: "u1",
    competencyWeights: [
      { competencyId: "comp1", weight: 0.7 },
      { competencyId: "comp2", weight: 0.3 },
    ],
  });
  const scores = [
    createScore({ candidateHandle: "CAND-01", competencyId: "comp1", value: 4, scaleMin: 1, scaleMax: 5, rationale: "x", evidenceChunkIds: ["ch1"] }),
    createScore({ candidateHandle: "CAND-01", competencyId: "comp2", value: 2, scaleMin: 1, scaleMax: 5, rationale: "x", evidenceChunkIds: ["ch2"] }),
  ];

  assert.equal(compositeScore(scores, rubric), 4 * 0.7 + 2 * 0.3);

  const incomplete = [scores[0]];
  assert.throws(() => compositeScore(incomplete, rubric), ValidationError);
});

test("Score without an evidenceChunkId is rejected — a score must be grounded", () => {
  assert.throws(
    () => createScore({ candidateHandle: "CAND-01", competencyId: "comp1", value: 3, scaleMin: 1, scaleMax: 5, rationale: "x", evidenceChunkIds: [] }),
    ValidationError,
  );
});

test("Run enforces the ADR-0002 state machine: cannot skip from EXTRACT_EVIDENCE straight to DRAFT_SHORTLIST", () => {
  let run = createRun({ id: "run1", workflowType: "screening", createdBy: "u1" });
  run = transition(run, "EXTRACT_EVIDENCE");
  assert.throws(() => transition(run, "DRAFT_SHORTLIST"), ValidationError);
  assert.doesNotThrow(() => transition(run, "REDACT_PROTECTED_ATTRS"));
});

test("Run reaches a terminal state and records full history", () => {
  let run = createRun({ id: "run1", workflowType: "screening", createdBy: "u1" });
  for (const next of ["EXTRACT_EVIDENCE", "REDACT_PROTECTED_ATTRS", "SCORE_RUBRIC", "DRAFT_SHORTLIST", "AWAIT_APPROVAL", "GENERATE_REPORT", "COMPLETE"]) {
    run = transition(run, next);
  }
  assert.equal(isTerminal(run), true);
  assert.equal(run.history.length, 8);
});

test("Run can degrade from SCORE_RUBIC to DEGRADED_DRAFT and still reach AWAIT_APPROVAL", () => {
  let run = createRun({ id: "run1", workflowType: "screening", createdBy: "u1" });
  run = transition(run, "EXTRACT_EVIDENCE");
  run = transition(run, "REDACT_PROTECTED_ATTRS");
  run = transition(run, "SCORE_RUBRIC");
  run = transition(run, "DEGRADED_DRAFT");
  assert.doesNotThrow(() => transition(run, "AWAIT_APPROVAL"));
});

test("An edited_and_approved Approval requires an editDiff to remain auditable", () => {
  assert.throws(
    () => createApproval({ id: "a1", runId: "run1", decision: "edited_and_approved", decidedBy: "hm1" }),
    ValidationError,
  );
  assert.doesNotThrow(() =>
    createApproval({ id: "a1", runId: "run1", decision: "edited_and_approved", decidedBy: "hm1", editDiff: { field: "old->new" } }),
  );
});

test("User rejects an invalid email, a missing passwordHash, and an unknown role", () => {
  assert.throws(() => createUser({ id: "u1", email: "not-an-email", passwordHash: "h", role: "recruiter" }), ValidationError);
  assert.throws(() => createUser({ id: "u1", email: "a@b.com", passwordHash: "", role: "recruiter" }), ValidationError);
  assert.throws(() => createUser({ id: "u1", email: "a@b.com", passwordHash: "h", role: "admin" }), ValidationError);
});

test("User lowercases email so lookups are case-insensitive", () => {
  const user = createUser({ id: "u1", email: "Recruiter@Example.com", passwordHash: "h", role: "recruiter" });
  assert.equal(user.email, "recruiter@example.com");
});
