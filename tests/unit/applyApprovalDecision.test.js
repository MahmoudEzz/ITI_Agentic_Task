import { test } from "node:test";
import assert from "node:assert/strict";

import { createApplyApprovalDecisionUseCase } from "../../src/application/workflows/applyApprovalDecision.js";
import { NotFoundError, ValidationError } from "../../src/domain/errors/index.js";

function stubRunRepository(initialState) {
  const transitions = [];
  let state = initialState;
  return {
    transitions,
    findById: async (id) => (state ? { id, state, updatedAt: new Date() } : null),
    transitionTo: async (id, nextState, options) => {
      state = nextState;
      transitions.push(nextState);
      return { id, state: nextState, note: options?.note ?? null };
    },
  };
}

function stubApprovalRepository() {
  const created = [];
  return { created, create: async (approval) => (created.push(approval), approval) };
}

function makeDeps({ runState = "AWAIT_APPROVAL", finalizeShortlist, draftedShortlist }) {
  return {
    runRepository: stubRunRepository(runState),
    approvalRepository: stubApprovalRepository(),
    shortlistRepository: { findByRunId: async () => draftedShortlist },
    finalizeShortlist: finalizeShortlist ?? (async ({ runId, approvalId, shortlist }) => ({ shortlistId: "sl-1", finalizedAt: new Date().toISOString(), _debug: { runId, approvalId, shortlist } })),
  };
}

test("approved: creates the Approval, finalizes the shortlist as-is, transitions to GENERATE_REPORT", async () => {
  const draftedShortlist = { entries: [{ candidateHandle: "CAND-001", rank: 1 }, { candidateHandle: "CAND-002", rank: 2 }] };
  const deps = makeDeps({ draftedShortlist });
  const applyApprovalDecision = createApplyApprovalDecisionUseCase(deps);

  const result = await applyApprovalDecision({ runId: "run-1", decision: "approved", decidedBy: "hm@example.com" });

  assert.equal(deps.approvalRepository.created[0].decision, "approved");
  assert.equal(deps.runRepository.transitions.at(-1), "GENERATE_REPORT");
  assert.ok(result.finalized.shortlistId);
});

test("approved with no explicit finalShortlist defaults to the drafted ranking unchanged", async () => {
  let captured;
  const draftedShortlist = { entries: [{ candidateHandle: "CAND-001", rank: 1 }, { candidateHandle: "CAND-002", rank: 2 }] };
  const finalizeShortlist = async (args) => {
    captured = args;
    return { shortlistId: "sl-1", finalizedAt: new Date().toISOString() };
  };
  const applyApprovalDecision = createApplyApprovalDecisionUseCase(makeDeps({ draftedShortlist, finalizeShortlist }));

  await applyApprovalDecision({ runId: "run-1", decision: "approved", decidedBy: "hm@example.com" });

  assert.deepEqual(captured.shortlist, [{ candidateHandle: "CAND-001", rank: 1 }, { candidateHandle: "CAND-002", rank: 2 }]);
});

test("edited_and_approved: passes the caller's edited ranking through to finalize_shortlist, requires an editDiff", async () => {
  let captured;
  const finalizeShortlist = async (args) => {
    captured = args;
    return { shortlistId: "sl-1", finalizedAt: new Date().toISOString() };
  };
  const deps = makeDeps({ finalizeShortlist, draftedShortlist: { entries: [] } });
  const applyApprovalDecision = createApplyApprovalDecisionUseCase(deps);

  const editedShortlist = [{ candidateHandle: "CAND-002", rank: 1 }, { candidateHandle: "CAND-001", rank: 2 }];
  await applyApprovalDecision({
    runId: "run-1",
    decision: "edited_and_approved",
    decidedBy: "hm@example.com",
    editDiff: { reordered: true },
    finalShortlist: editedShortlist,
  });

  assert.deepEqual(captured.shortlist, editedShortlist);
});

test("edited_and_approved without an editDiff is rejected — Approval.js's own invariant", async () => {
  const applyApprovalDecision = createApplyApprovalDecisionUseCase(makeDeps({ draftedShortlist: { entries: [] } }));
  await assert.rejects(() =>
    applyApprovalDecision({ runId: "run-1", decision: "edited_and_approved", decidedBy: "hm@example.com" }),
  );
});

test("rejected: creates the Approval, transitions to REJECTED, never calls finalize_shortlist", async () => {
  let finalizeCalled = false;
  const deps = makeDeps({ finalizeShortlist: async () => (finalizeCalled = true) });
  const applyApprovalDecision = createApplyApprovalDecisionUseCase(deps);

  const result = await applyApprovalDecision({ runId: "run-1", decision: "rejected", decidedBy: "hm@example.com", comment: "not a fit" });

  assert.equal(deps.approvalRepository.created[0].decision, "rejected");
  assert.equal(deps.runRepository.transitions.at(-1), "REJECTED");
  assert.equal(finalizeCalled, false);
  assert.equal(result.finalized, null);
});

test("throws NotFoundError for an unknown runId", async () => {
  const applyApprovalDecision = createApplyApprovalDecisionUseCase(makeDeps({ runState: null }));
  await assert.rejects(() => applyApprovalDecision({ runId: "not-real", decision: "approved", decidedBy: "x" }), NotFoundError);
});

test("throws when the run is not in AWAIT_APPROVAL — a decision cannot be applied twice or to an in-flight run", async () => {
  const applyApprovalDecision = createApplyApprovalDecisionUseCase(makeDeps({ runState: "SCORE_RUBRIC" }));
  await assert.rejects(() => applyApprovalDecision({ runId: "run-1", decision: "approved", decidedBy: "x" }), ValidationError);
});

test("throws when a decision was already applied and the run has moved past AWAIT_APPROVAL (e.g. GENERATE_REPORT) — a decision cannot be applied twice", async () => {
  const applyApprovalDecision = createApplyApprovalDecisionUseCase(makeDeps({ runState: "GENERATE_REPORT" }));
  await assert.rejects(() => applyApprovalDecision({ runId: "run-1", decision: "approved", decidedBy: "x" }), ValidationError);
});
