import { test } from "node:test";
import assert from "node:assert/strict";

import { createGenerateReportTool } from "../../src/application/tools/generateReport.js";
import { ApprovalRequiredError } from "../../src/domain/errors/index.js";

function stubDeps({ approval, reportContent = { candidates: [] }, generatedContent = Buffer.from("fake-bytes") }) {
  const created = [];
  return {
    approvalRepository: { findByRunId: async () => approval },
    reportAssetRepository: { create: async (asset) => (created.push(asset), asset) },
    buildReportContent: async () => reportContent,
    documentGenerator: { generate: async () => generatedContent },
    created,
  };
}

test("generates and stores a report when a real approved Approval backs the run/approval pair", async () => {
  const approval = { id: "appr-1", runId: "run-1", decision: "approved" };
  const deps = stubDeps({ approval });
  const generateReport = createGenerateReportTool(deps);

  const result = await generateReport({ runId: "run-1", approvalId: "appr-1", format: "docx" });

  assert.equal(result.format, "docx");
  assert.ok(result.assetId);
  assert.ok(result.generatedAt);
  assert.equal(deps.created[0].format, "docx");
  assert.equal(deps.created[0].runId, "run-1");
  assert.equal(deps.created[0].approvalId, "appr-1");
});

test("accepts edited_and_approved as a valid backing decision", async () => {
  const approval = { id: "appr-1", runId: "run-1", decision: "edited_and_approved" };
  const generateReport = createGenerateReportTool(stubDeps({ approval }));

  const result = await generateReport({ runId: "run-1", approvalId: "appr-1", format: "pdf" });
  assert.equal(result.format, "pdf");
});

test("throws ApprovalRequiredError when no approval exists for the run at all", async () => {
  const generateReport = createGenerateReportTool(stubDeps({ approval: null }));
  await assert.rejects(() => generateReport({ runId: "run-1", approvalId: "appr-1", format: "docx" }), ApprovalRequiredError);
});

test("throws ApprovalRequiredError when the approvalId doesn't match the real approval on record", async () => {
  const approval = { id: "appr-REAL", runId: "run-1", decision: "approved" };
  const generateReport = createGenerateReportTool(stubDeps({ approval }));
  await assert.rejects(() => generateReport({ runId: "run-1", approvalId: "appr-FORGED", format: "docx" }), ApprovalRequiredError);
});

test("throws ApprovalRequiredError when the backing approval was a rejection", async () => {
  const approval = { id: "appr-1", runId: "run-1", decision: "rejected" };
  const generateReport = createGenerateReportTool(stubDeps({ approval }));
  await assert.rejects(() => generateReport({ runId: "run-1", approvalId: "appr-1", format: "docx" }), ApprovalRequiredError);
});

test("never calls buildReportContent or the document generator when the approval gate fails", async () => {
  let buildCalled = false;
  let generateCalled = false;
  const deps = {
    approvalRepository: { findByRunId: async () => null },
    reportAssetRepository: { create: async () => ({}) },
    buildReportContent: async () => ((buildCalled = true), { candidates: [] }),
    documentGenerator: { generate: async () => ((generateCalled = true), Buffer.from("x")) },
  };
  const generateReport = createGenerateReportTool(deps);

  await assert.rejects(() => generateReport({ runId: "run-1", approvalId: "appr-1", format: "docx" }), ApprovalRequiredError);
  assert.equal(buildCalled, false);
  assert.equal(generateCalled, false);
});
