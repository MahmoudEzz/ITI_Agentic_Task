import { test } from "node:test";
import assert from "node:assert/strict";

import { createEvidenceExtractorAgent } from "../../src/application/agents/evidenceExtractor.js";
import { InsufficientEvidenceError, NotFoundError, StructuredOutputError } from "../../src/domain/errors/index.js";

const TEMPLATE = "COMPETENCIES:\n{{competencies}}\n\nCHUNKS:\n{{chunks}}";

function stubDeps({ chunks, completeText, competencies }) {
  return {
    llmProvider: { complete: async () => ({ text: completeText }) },
    competencyRepository: { findById: async (id) => competencies.find((c) => c.id === id) ?? null },
    callTool: async () => ({ chunks }),
    promptTemplate: TEMPLATE,
  };
}

const TECH_PROF = { id: "TECH-PROF", name: "Technical Proficiency", description: "desc" };

test("returns validated evidence when the model cites a real fetched chunk id", async () => {
  const deps = stubDeps({
    chunks: [{ chunkId: "cv-001-chunk-0", content: "Built and shipped 3 production services." }],
    completeText: JSON.stringify({
      evidenceByCompetency: [{ competencyId: "TECH-PROF", snippets: [{ text: "Built and shipped 3 production services.", sourceChunkId: "cv-001-chunk-0" }] }],
    }),
    competencies: [TECH_PROF],
  });

  const evidenceExtractor = createEvidenceExtractorAgent(deps);
  const result = await evidenceExtractor({ candidateHandle: "CAND-001", competencyIds: ["TECH-PROF"] });

  assert.equal(result.evidenceByCompetency.length, 1);
  assert.equal(result.evidenceByCompetency[0].snippets[0].sourceChunkId, "cv-001-chunk-0");
});

test("rejects and retries when the model invents a sourceChunkId it was never given, eventually throwing", async () => {
  const deps = stubDeps({
    chunks: [{ chunkId: "cv-001-chunk-0", content: "Built and shipped 3 production services." }],
    completeText: JSON.stringify({
      evidenceByCompetency: [{ competencyId: "TECH-PROF", snippets: [{ text: "fabricated", sourceChunkId: "cv-999-chunk-invented" }] }],
    }),
    competencies: [TECH_PROF],
  });

  const evidenceExtractor = createEvidenceExtractorAgent(deps);
  await assert.rejects(() => evidenceExtractor({ candidateHandle: "CAND-001", competencyIds: ["TECH-PROF"] }), StructuredOutputError);
});

test("throws InsufficientEvidenceError when the candidate has no chunks at all", async () => {
  const deps = stubDeps({ chunks: [], completeText: "n/a", competencies: [TECH_PROF] });
  const evidenceExtractor = createEvidenceExtractorAgent(deps);

  await assert.rejects(() => evidenceExtractor({ candidateHandle: "CAND-001", competencyIds: ["TECH-PROF"] }), InsufficientEvidenceError);
});

test("throws NotFoundError for an unknown competencyId", async () => {
  const deps = stubDeps({ chunks: [{ chunkId: "c1", content: "x" }], completeText: "n/a", competencies: [] });
  const evidenceExtractor = createEvidenceExtractorAgent(deps);

  await assert.rejects(() => evidenceExtractor({ candidateHandle: "CAND-001", competencyIds: ["NOT-REAL"] }), NotFoundError);
});
