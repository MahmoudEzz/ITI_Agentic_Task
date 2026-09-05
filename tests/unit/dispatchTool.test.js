import { test } from "node:test";
import assert from "node:assert/strict";

import { createScopedToolDispatcher } from "../../src/application/tools/dispatchTool.js";
import { ToolNotAllowedError } from "../../src/domain/errors/index.js";

function fakeImplementations() {
  return {
    search_corpus: async () => ({ results: [] }),
    get_candidate_chunks: async () => ({ chunks: [] }),
  };
}

test("calls the implementation when the tool is on the agent's allow-list", async () => {
  const callTool = createScopedToolDispatcher({
    agentName: "evidence_extractor",
    allowedTools: ["get_candidate_chunks"],
    implementations: fakeImplementations(),
  });

  const result = await callTool("get_candidate_chunks", { candidateHandle: "CAND-001" });
  assert.deepEqual(result, { chunks: [] });
});

test("rejects a tool call outside the agent's allow-list — the mechanism behind FR-4's restricted allow-list claim", async () => {
  // The Rubric Scorer receives evidence as input and calls no tools at all
  // (a pure evidence-to-score transform) — this is exactly the scenario
  // the acceptance criteria for issue #38 names.
  const callTool = createScopedToolDispatcher({
    agentName: "rubric_scorer",
    allowedTools: [],
    implementations: fakeImplementations(),
  });

  await assert.rejects(() => callTool("search_corpus", { query: "x" }), ToolNotAllowedError);
});

test("rejecting a disallowed tool never invokes its implementation", async () => {
  let called = false;
  const implementations = {
    search_corpus: async () => {
      called = true;
      return { results: [] };
    },
  };
  const callTool = createScopedToolDispatcher({ agentName: "rubric_scorer", allowedTools: [], implementations });

  await assert.rejects(() => callTool("search_corpus", { query: "x" }));
  assert.equal(called, false);
});

test("throws for a tool name that isn't registered at all, even if allow-listed by mistake", async () => {
  const callTool = createScopedToolDispatcher({
    agentName: "evidence_extractor",
    allowedTools: ["delete_everything"],
    implementations: {},
  });

  await assert.rejects(() => callTool("delete_everything", {}));
});
