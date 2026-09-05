import { test } from "node:test";
import assert from "node:assert/strict";

import { createRubricScorerAgent } from "../../src/application/agents/rubricScorer.js";
import { StructuredOutputError } from "../../src/domain/errors/index.js";

const TEMPLATE = "CANDIDATE: {{candidateHandle}}\n{{competencyBlocks}}";

const VALID_INPUT = {
  candidateHandle: "CAND-001",
  rubricId: "rubric-backend-engineer",
  evidenceByCompetency: [
    {
      competencyId: "TECH-PROF",
      evidenceSnippets: [{ text: "Built and shipped 3 production services independently.", sourceChunkId: "cv-001-chunk-0" }],
      rubricCriteria: "Level 3: independent production-level competence.",
    },
  ],
};

test("returns validated scores when evidenceChunkIds reference real input evidence", async () => {
  const llmProvider = {
    complete: async () => ({
      text: JSON.stringify({ scores: [{ competencyId: "TECH-PROF", value: 3, rationale: "Shipped independently.", evidenceChunkIds: ["cv-001-chunk-0"] }] }),
    }),
  };
  const rubricScorer = createRubricScorerAgent({ llmProvider, promptTemplate: TEMPLATE });

  const result = await rubricScorer(VALID_INPUT);
  assert.equal(result.scores[0].value, 3);
  assert.deepEqual(result.scores[0].evidenceChunkIds, ["cv-001-chunk-0"]);
});

test("rejects and eventually throws when the model cites an evidenceChunkId not present in its own input", async () => {
  const llmProvider = {
    complete: async () => ({
      text: JSON.stringify({ scores: [{ competencyId: "TECH-PROF", value: 5, rationale: "x", evidenceChunkIds: ["invented-chunk-id"] }] }),
    }),
  };
  const rubricScorer = createRubricScorerAgent({ llmProvider, promptTemplate: TEMPLATE });

  await assert.rejects(() => rubricScorer(VALID_INPUT), StructuredOutputError);
});

test("rejects and eventually throws when the model scores only some of the competencies it was given evidence for", async () => {
  const twoCompetencyInput = {
    ...VALID_INPUT,
    evidenceByCompetency: [
      ...VALID_INPUT.evidenceByCompetency,
      { competencyId: "COMMS", evidenceSnippets: [{ text: "Wrote a clear design doc.", sourceChunkId: "cv-001-chunk-1" }], rubricCriteria: "Level 3: adapts explanation to audience." },
    ],
  };
  const llmProvider = {
    // Only scores TECH-PROF, silently drops COMMS — observed for real
    // against a live Ollama call, not a hypothetical failure mode.
    complete: async () => ({
      text: JSON.stringify({ scores: [{ competencyId: "TECH-PROF", value: 3, rationale: "x", evidenceChunkIds: ["cv-001-chunk-0"] }] }),
    }),
  };
  const rubricScorer = createRubricScorerAgent({ llmProvider, promptTemplate: TEMPLATE });

  await assert.rejects(() => rubricScorer(twoCompetencyInput), StructuredOutputError);
});

test("rejects an input containing a name-carrying field — the schema-level bias-safety guarantee (ADR-0006)", async () => {
  const llmProvider = { complete: async () => ({ text: "n/a" }) };
  const rubricScorer = createRubricScorerAgent({ llmProvider, promptTemplate: TEMPLATE });

  await assert.rejects(() => rubricScorer({ ...VALID_INPUT, fullName: "Ahmed Youssef" }));
});
