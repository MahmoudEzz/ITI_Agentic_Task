import { test } from "node:test";
import assert from "node:assert/strict";

import { createBuildReportContentUseCase } from "../../src/application/reporting/buildReportContent.js";
import { NotFoundError, ValidationError } from "../../src/domain/errors/index.js";

const RUBRIC = {
  id: "rubric-1",
  roleId: "backend-engineer",
  competencyWeights: [
    { competencyId: "TECH-PROF", weight: 0.6 },
    { competencyId: "COMMS", weight: 0.4 },
  ],
};

const COMPETENCIES = {
  "TECH-PROF": { id: "TECH-PROF", name: "Technical Proficiency", scaleMax: 5 },
  COMMS: { id: "COMMS", name: "Communication", scaleMax: 5 },
};

function stubDeps({ run, shortlist, scoresByCandidate = {}, citations = [] }) {
  return {
    runRepository: { findById: async () => run },
    shortlistRepository: { findByRunId: async () => shortlist },
    scoreRepository: { findByRunAndCandidate: async (_runId, handle) => scoresByCandidate[handle] ?? [] },
    competencyRepository: { findById: async (id) => COMPETENCIES[id] ?? null },
    rubricRepository: { findByRoleId: async () => RUBRIC },
    vectorStore: { findByIds: async () => citations },
  };
}

const RUN = { id: "run-1", workflowType: "screening", createdBy: "recruiter@example.com" };
const FINALIZED_SHORTLIST = {
  roleId: "backend-engineer",
  degraded: false,
  finalizedAt: new Date().toISOString(),
  entries: [
    { candidateHandle: "CAND-001", rank: 1, summary: "Strong candidate.", interviewProbes: ["probe 1", "probe 2"] },
    { candidateHandle: "CAND-002", rank: 2, summary: "Degraded candidate.", interviewProbes: ["probe 1", "probe 2"] },
  ],
};

test("throws NotFoundError for an unknown runId", async () => {
  const buildReportContent = createBuildReportContentUseCase(stubDeps({ run: null }));
  await assert.rejects(() => buildReportContent("nope"), NotFoundError);
});

test("throws NotFoundError when no shortlist was ever drafted for the run", async () => {
  const buildReportContent = createBuildReportContentUseCase(stubDeps({ run: RUN, shortlist: null }));
  await assert.rejects(() => buildReportContent("run-1"), NotFoundError);
});

test("throws ValidationError when the shortlist exists but was never finalized", async () => {
  const buildReportContent = createBuildReportContentUseCase(stubDeps({ run: RUN, shortlist: { ...FINALIZED_SHORTLIST, finalizedAt: null } }));
  await assert.rejects(() => buildReportContent("run-1"), ValidationError);
});

test("computes composite scores and resolves citations for a normal (non-degraded) candidate", async () => {
  const scoresByCandidate = {
    "CAND-001": [
      { candidateHandle: "CAND-001", competencyId: "TECH-PROF", value: 5, rationale: "Great code.", evidenceChunkIds: ["chunk-1"] },
      { candidateHandle: "CAND-001", competencyId: "COMMS", value: 3, rationale: "Adequate.", evidenceChunkIds: ["chunk-2"] },
    ],
    "CAND-002": [],
  };
  const citations = [{ chunkId: "chunk-1", documentId: "doc-1", documentTitle: "CAND-001 CV", page: 1, section: null }];

  const buildReportContent = createBuildReportContentUseCase(stubDeps({ run: RUN, shortlist: FINALIZED_SHORTLIST, scoresByCandidate, citations }));
  const content = await buildReportContent("run-1");

  assert.equal(content.candidates.length, 2);
  const [first, second] = content.candidates;
  assert.equal(first.candidateHandle, "CAND-001");
  assert.equal(first.compositeScore, 5 * 0.6 + 3 * 0.4);
  assert.equal(second.candidateHandle, "CAND-002");
  assert.equal(second.compositeScore, null); // no scores at all — a degraded-draft candidate
  assert.equal(content.citationsByChunkId.get("chunk-1").documentTitle, "CAND-001 CV");
  assert.equal(content.competencies.length, 2);
});

test("candidates are returned sorted by rank regardless of the shortlist entries' order", async () => {
  const shortlist = { ...FINALIZED_SHORTLIST, entries: [...FINALIZED_SHORTLIST.entries].reverse() };
  const buildReportContent = createBuildReportContentUseCase(stubDeps({ run: RUN, shortlist }));
  const content = await buildReportContent("run-1");
  assert.deepEqual(content.candidates.map((c) => c.candidateHandle), ["CAND-001", "CAND-002"]);
});
