import { test } from "node:test";
import assert from "node:assert/strict";

import { TOOL_REGISTRY, getToolDefinition, FinalizeShortlistInputSchema, GenerateReportInputSchema } from "../../src/contracts/tools.js";
import { NotFoundError } from "../../src/domain/errors/index.js";

test("exactly the two write/side-effecting tools are marked isWrite — the approval gate depends on this flag", () => {
  const writeTools = Object.entries(TOOL_REGISTRY)
    .filter(([, def]) => def.isWrite)
    .map(([name]) => name)
    .sort();

  assert.deepEqual(writeTools, ["finalize_shortlist", "generate_report"]);
});

test("there are at least 4 registered tools (FR-4 floor)", () => {
  assert.ok(Object.keys(TOOL_REGISTRY).length >= 4);
});

test("getToolDefinition throws NotFoundError for an unregistered tool name", () => {
  assert.throws(() => getToolDefinition("delete_everything"), NotFoundError);
});

test("FinalizeShortlistInputSchema requires an approvalId — a write tool cannot run without proof of a gate decision", () => {
  assert.throws(() =>
    FinalizeShortlistInputSchema.parse({ runId: "run1", shortlist: [{ candidateHandle: "CAND-01", rank: 1 }] }),
  );
  assert.doesNotThrow(() =>
    FinalizeShortlistInputSchema.parse({
      runId: "run1",
      approvalId: "appr1",
      shortlist: [{ candidateHandle: "CAND-01", rank: 1 }],
    }),
  );
});

test("GenerateReportInputSchema only accepts docx or pdf as the format", () => {
  assert.throws(() => GenerateReportInputSchema.parse({ runId: "run1", approvalId: "appr1", format: "html" }));
  assert.doesNotThrow(() => GenerateReportInputSchema.parse({ runId: "run1", approvalId: "appr1", format: "docx" }));
});
