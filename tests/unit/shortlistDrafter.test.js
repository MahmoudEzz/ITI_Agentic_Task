import { test } from "node:test";
import assert from "node:assert/strict";

import { createShortlistDrafterAgent } from "../../src/application/agents/shortlistDrafter.js";
import { StructuredOutputError } from "../../src/domain/errors/index.js";

const TEMPLATE = "ROLE: {{roleId}}\n{{candidateBlocks}}";

const VALID_INPUT = {
  roleId: "backend-engineer",
  candidates: [
    { candidateHandle: "CAND-001", compositeScore: 4.2, scores: [{ competencyId: "TECH-PROF", value: 4, rationale: "x", evidenceChunkIds: ["c1"] }] },
    { candidateHandle: "CAND-002", compositeScore: 3.1, scores: [{ competencyId: "TECH-PROF", value: 3, rationale: "y", evidenceChunkIds: ["c2"] }] },
  ],
};

test("returns a validated shortlist referencing only real input candidates", async () => {
  const llmProvider = {
    complete: async () => ({
      text: JSON.stringify({
        shortlist: [
          { candidateHandle: "CAND-001", rank: 1, summary: "Strong technical depth.", interviewProbes: ["Probe on incident response.", "Probe on system design."] },
          { candidateHandle: "CAND-002", rank: 2, summary: "Solid but less experienced.", interviewProbes: ["Probe on ownership.", "Probe on collaboration."] },
        ],
      }),
    }),
  };
  const shortlistDrafter = createShortlistDrafterAgent({ llmProvider, promptTemplate: TEMPLATE });

  const result = await shortlistDrafter(VALID_INPUT);
  assert.equal(result.shortlist.length, 2);
  assert.equal(result.shortlist[0].candidateHandle, "CAND-001");
});

test("rejects and eventually throws when the model ranks a candidateHandle it wasn't given", async () => {
  const llmProvider = {
    complete: async () => ({
      text: JSON.stringify({
        shortlist: [{ candidateHandle: "CAND-999", rank: 1, summary: "x", interviewProbes: ["a", "b"] }],
      }),
    }),
  };
  const shortlistDrafter = createShortlistDrafterAgent({ llmProvider, promptTemplate: TEMPLATE });

  await assert.rejects(() => shortlistDrafter(VALID_INPUT), StructuredOutputError);
});
