import { test } from "node:test";
import assert from "node:assert/strict";

import { createExtractRedactScoreWorkflow } from "../../src/application/workflows/extractRedactScore.js";
import { createRubricScorerAgent } from "../../src/application/agents/rubricScorer.js";
import { InsufficientEvidenceError } from "../../src/domain/errors/index.js";

const RUBRIC_SCORER_TEMPLATE = "CANDIDATE: {{candidateHandle}}\n{{competencyBlocks}}";

const RUBRIC = { id: "rubric-x", roleId: "backend-engineer", competencyWeights: [{ competencyId: "TECH-PROF", weight: 1 }] };
const TECH_PROF = {
  id: "TECH-PROF",
  name: "Technical Proficiency",
  description: "Depth of hands-on technical skill.",
  behavioralAnchors: { 1: "a", 2: "b", 3: "c", 4: "d", 5: "e" },
};

function stubRepos() {
  return {
    rubricRepository: { findById: async (id) => (id === RUBRIC.id ? RUBRIC : null) },
    competencyRepository: { findById: async (id) => (id === TECH_PROF.id ? TECH_PROF : null) },
  };
}

// This is the acceptance bar for issue #13, D6's named bias risk: assert
// against the actual prompt STRING handed to the Rubric Scorer's
// llmProvider.complete() call — a spy on the real LLM call boundary, not a
// check that the input object merely satisfies RubricScorerInputSchema
// (which only proves no *name field* exists, not that protected-attribute
// *language* was scrubbed from the evidence text itself).
test("redacts protected-attribute language from evidence before it reaches the Rubric Scorer's actual LLM prompt", async () => {
  const capturedPrompts = [];
  const llmProvider = {
    complete: async ({ prompt }) => {
      capturedPrompts.push(prompt);
      return { text: JSON.stringify({ scores: [{ competencyId: "TECH-PROF", value: 4, rationale: "Led a team effectively.", evidenceChunkIds: ["cv-001-chunk-0"] }] }) };
    },
  };

  const evidenceExtractor = async () => ({
    evidenceByCompetency: [
      {
        competencyId: "TECH-PROF",
        snippets: [{ text: "She led a team of 5 engineers and shipped a payments platform independently.", sourceChunkId: "cv-001-chunk-0" }],
      },
    ],
  });

  const rubricScorer = createRubricScorerAgent({ llmProvider, promptTemplate: RUBRIC_SCORER_TEMPLATE });
  const extractRedactScore = createExtractRedactScoreWorkflow({ evidenceExtractor, rubricScorer, ...stubRepos() });

  await extractRedactScore({ candidateHandle: "CAND-001", rubricId: "rubric-x" });

  assert.equal(capturedPrompts.length, 1);
  // The actual failure mode this guards against: a gendered pronoun (or any
  // flagged span) reaching the model's prompt string.
  assert.doesNotMatch(capturedPrompts[0], /\bShe\b/);
  assert.match(capturedPrompts[0], /\[REDACTED:GENDER\]/);
});

test("returns the redaction audit trail alongside scores, for the caller to persist to bias_audit_log", async () => {
  const llmProvider = {
    complete: async () => ({
      text: JSON.stringify({ scores: [{ competencyId: "TECH-PROF", value: 3, rationale: "x", evidenceChunkIds: ["cv-001-chunk-0"] }] }),
    }),
  };
  const evidenceExtractor = async () => ({
    evidenceByCompetency: [{ competencyId: "TECH-PROF", snippets: [{ text: "He built a system.", sourceChunkId: "cv-001-chunk-0" }] }],
  });
  const rubricScorer = createRubricScorerAgent({ llmProvider, promptTemplate: RUBRIC_SCORER_TEMPLATE });
  const extractRedactScore = createExtractRedactScoreWorkflow({ evidenceExtractor, rubricScorer, ...stubRepos() });

  const result = await extractRedactScore({ candidateHandle: "CAND-001", rubricId: "rubric-x" });

  assert.equal(result.auditEntries.length, 1);
  assert.equal(result.auditEntries[0].category, "gender");
  assert.equal(result.auditEntries[0].action, "redact");
});

test("throws InsufficientEvidenceError when redaction drops the only evidence for a rubric-required competency", async () => {
  // A snippet whose matched spans exceed the 40% drop-ratio threshold is
  // dropped entirely, not partially redacted — forcing exactly the gap
  // extractRedactScore must refuse on rather than silently under-score.
  const llmProvider = { complete: async () => ({ text: "n/a — should never be called" }) };
  const evidenceExtractor = async () => ({
    evidenceByCompetency: [{ competencyId: "TECH-PROF", snippets: [{ text: "She is a Muslim American who graduated in 1998.", sourceChunkId: "cv-001-chunk-0" }] }],
  });
  const rubricScorer = createRubricScorerAgent({ llmProvider, promptTemplate: RUBRIC_SCORER_TEMPLATE });
  const extractRedactScore = createExtractRedactScoreWorkflow({ evidenceExtractor, rubricScorer, ...stubRepos() });

  await assert.rejects(() => extractRedactScore({ candidateHandle: "CAND-001", rubricId: "rubric-x" }), InsufficientEvidenceError);
});
