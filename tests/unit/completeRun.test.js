import { test } from "node:test";
import assert from "node:assert/strict";

import { createCompleteRunUseCase } from "../../src/application/workflows/completeRun.js";
import { NotFoundError, ValidationError } from "../../src/domain/errors/index.js";

function stubRunRepository(initialState) {
  const transitions = [];
  let state = initialState;
  return {
    transitions,
    findById: async (id) => (state ? { id, state, updatedAt: new Date() } : null),
    transitionTo: async (id, nextState) => {
      state = nextState;
      transitions.push(nextState);
      return { id, state: nextState };
    },
  };
}

function makeDeps({ runState = "GENERATE_REPORT", approval = { id: "appr-1", runId: "run-1", decision: "approved" }, generateReport } = {}) {
  return {
    runRepository: stubRunRepository(runState),
    approvalRepository: { findByRunId: async () => approval },
    generateReport: generateReport ?? (async ({ runId, approvalId, format }) => ({ assetId: "asset-1", format, generatedAt: new Date().toISOString(), _debug: { runId, approvalId } })),
  };
}

test("calls generate_report with the run's real backing approval and transitions to COMPLETE", async () => {
  let captured;
  const generateReport = async (args) => {
    captured = args;
    return { assetId: "asset-1", format: args.format, generatedAt: new Date().toISOString() };
  };
  const deps = makeDeps({ generateReport });
  const completeRun = createCompleteRunUseCase(deps);

  const result = await completeRun({ runId: "run-1", format: "docx" });

  assert.deepEqual(captured, { runId: "run-1", approvalId: "appr-1", format: "docx" });
  assert.equal(deps.runRepository.transitions.at(-1), "COMPLETE");
  assert.equal(result.asset.assetId, "asset-1");
});

test("throws NotFoundError for an unknown runId", async () => {
  const completeRun = createCompleteRunUseCase(makeDeps({ runState: null }));
  await assert.rejects(() => completeRun({ runId: "not-real", format: "docx" }), NotFoundError);
});

test("throws when the run is not in GENERATE_REPORT (e.g. still AWAIT_APPROVAL)", async () => {
  const completeRun = createCompleteRunUseCase(makeDeps({ runState: "AWAIT_APPROVAL" }));
  await assert.rejects(() => completeRun({ runId: "run-1", format: "docx" }), ValidationError);
});

test("throws when a run has already completed — cannot complete twice", async () => {
  const completeRun = createCompleteRunUseCase(makeDeps({ runState: "COMPLETE" }));
  await assert.rejects(() => completeRun({ runId: "run-1", format: "docx" }), ValidationError);
});

test("throws NotFoundError when the run has no backing approval at all", async () => {
  const completeRun = createCompleteRunUseCase(makeDeps({ approval: null }));
  await assert.rejects(() => completeRun({ runId: "run-1", format: "docx" }), NotFoundError);
});

test("never transitions to COMPLETE when generate_report itself throws", async () => {
  const deps = makeDeps({
    generateReport: async () => {
      throw new Error("rendering failed");
    },
  });
  const completeRun = createCompleteRunUseCase(deps);

  await assert.rejects(() => completeRun({ runId: "run-1", format: "docx" }));
  assert.equal(deps.runRepository.transitions.length, 0);
});
