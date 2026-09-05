import { test } from "node:test";
import assert from "node:assert/strict";

import { createFinalizeShortlistTool } from "../../src/application/tools/finalizeShortlist.js";
import { ApprovalRequiredError, NotFoundError, ValidationError } from "../../src/domain/errors/index.js";

const DRAFTED_SHORTLIST = {
  id: "shortlist-1",
  entries: [
    { candidateHandle: "CAND-001", rank: 1, summary: "s1", interviewProbes: ["a", "b"] },
    { candidateHandle: "CAND-002", rank: 2, summary: "s2", interviewProbes: ["c", "d"] },
  ],
};

function stubDeps({ approval, shortlist = DRAFTED_SHORTLIST, finalizeResult }) {
  return {
    approvalRepository: { findByRunId: async () => approval },
    shortlistRepository: {
      findByRunId: async () => shortlist,
      finalize: async (id, options) => finalizeResult ?? { id, ...options },
    },
  };
}

test("finalizes when a real approved Approval backs the runId/approvalId pair", async () => {
  const approval = { id: "appr-1", runId: "run-1", decision: "approved" };
  const finalizeShortlist = createFinalizeShortlistTool(stubDeps({ approval }));

  const result = await finalizeShortlist({ runId: "run-1", approvalId: "appr-1", shortlist: [{ candidateHandle: "CAND-002", rank: 1 }, { candidateHandle: "CAND-001", rank: 2 }] });

  assert.equal(result.shortlistId, "shortlist-1");
  assert.ok(result.finalizedAt);
});

test("accepts edited_and_approved as a valid backing decision", async () => {
  const approval = { id: "appr-1", runId: "run-1", decision: "edited_and_approved" };
  const finalizeShortlist = createFinalizeShortlistTool(stubDeps({ approval }));

  const result = await finalizeShortlist({ runId: "run-1", approvalId: "appr-1", shortlist: [{ candidateHandle: "CAND-001", rank: 1 }] });
  assert.ok(result.shortlistId);
});

test("throws ApprovalRequiredError when no approval exists for the run at all", async () => {
  const finalizeShortlist = createFinalizeShortlistTool(stubDeps({ approval: null }));
  await assert.rejects(
    () => finalizeShortlist({ runId: "run-1", approvalId: "appr-1", shortlist: [{ candidateHandle: "CAND-001", rank: 1 }] }),
    ApprovalRequiredError,
  );
});

test("throws ApprovalRequiredError when the approvalId doesn't match the real approval on record", async () => {
  const approval = { id: "appr-REAL", runId: "run-1", decision: "approved" };
  const finalizeShortlist = createFinalizeShortlistTool(stubDeps({ approval }));
  await assert.rejects(
    () => finalizeShortlist({ runId: "run-1", approvalId: "appr-FORGED", shortlist: [{ candidateHandle: "CAND-001", rank: 1 }] }),
    ApprovalRequiredError,
  );
});

test("throws ApprovalRequiredError when the backing approval was a rejection — a rejected run can never finalize", async () => {
  const approval = { id: "appr-1", runId: "run-1", decision: "rejected" };
  const finalizeShortlist = createFinalizeShortlistTool(stubDeps({ approval }));
  await assert.rejects(
    () => finalizeShortlist({ runId: "run-1", approvalId: "appr-1", shortlist: [{ candidateHandle: "CAND-001", rank: 1 }] }),
    ApprovalRequiredError,
  );
});

test("throws ValidationError for a candidateHandle not present in the drafted shortlist", async () => {
  const approval = { id: "appr-1", runId: "run-1", decision: "approved" };
  const finalizeShortlist = createFinalizeShortlistTool(stubDeps({ approval }));
  await assert.rejects(
    () => finalizeShortlist({ runId: "run-1", approvalId: "appr-1", shortlist: [{ candidateHandle: "CAND-999", rank: 1 }] }),
    ValidationError,
  );
});

test("throws NotFoundError when no shortlist was ever drafted for the run", async () => {
  const approval = { id: "appr-1", runId: "run-1", decision: "approved" };
  const finalizeShortlist = createFinalizeShortlistTool(stubDeps({ approval, shortlist: null }));
  await assert.rejects(
    () => finalizeShortlist({ runId: "run-1", approvalId: "appr-1", shortlist: [{ candidateHandle: "CAND-001", rank: 1 }] }),
    NotFoundError,
  );
});
