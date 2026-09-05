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

test("resolves each score's evidenceChunkIds to the real, already-redacted snippet text — never the model's own words, never pre-redaction text", async () => {
  const llmProvider = {
    complete: async () => ({
      text: JSON.stringify({ scores: [{ competencyId: "TECH-PROF", value: 3, rationale: "Built a system independently.", evidenceChunkIds: ["cv-001-chunk-0"] }] }),
    }),
  };
  const evidenceExtractor = async () => ({
    evidenceByCompetency: [{ competencyId: "TECH-PROF", snippets: [{ text: "He built a payments system independently.", sourceChunkId: "cv-001-chunk-0" }] }],
  });
  const rubricScorer = createRubricScorerAgent({ llmProvider, promptTemplate: RUBRIC_SCORER_TEMPLATE });
  const extractRedactScore = createExtractRedactScoreWorkflow({ evidenceExtractor, rubricScorer, ...stubRepos() });

  const result = await extractRedactScore({ candidateHandle: "CAND-001", rubricId: "rubric-x" });

  assert.equal(result.scores.length, 1);
  const [score] = result.scores;
  assert.equal(score.evidenceSnippets.length, 1);
  assert.equal(score.evidenceSnippets[0].sourceChunkId, "cv-001-chunk-0");
  assert.match(score.evidenceSnippets[0].text, /\[REDACTED:GENDER\]/);
  assert.doesNotMatch(score.evidenceSnippets[0].text, /\bHe\b/);
});

test("a score citing a chunk id with no matching evidence snippet resolves to an empty evidenceSnippets array, not a crash", async () => {
  const evidenceExtractor = async () => ({
    evidenceByCompetency: [{ competencyId: "TECH-PROF", snippets: [{ text: "Built a system.", sourceChunkId: "cv-001-chunk-0" }] }],
  });
  // A rubricScorer stub bypassing the real agent's knownChunkIds check —
  // simulates the (schema-prevented in practice) case defensively, so the
  // resolution step itself is proven not to throw on an unknown id.
  const rubricScorer = async () => ({ scores: [{ competencyId: "TECH-PROF", value: 3, rationale: "x", evidenceChunkIds: ["some-other-chunk"] }] });
  const extractRedactScore = createExtractRedactScoreWorkflow({ evidenceExtractor, rubricScorer, ...stubRepos() });

  const result = await extractRedactScore({ candidateHandle: "CAND-001", rubricId: "rubric-x" });

  assert.deepEqual(result.scores[0].evidenceSnippets, []);
});

test("a score that cites the same chunk id more than once resolves each real snippet exactly once, not duplicated per citation", async () => {
  // Live-observed against a real Ollama run against cv-015-youssef-adly:
  // the model's evidenceChunkIds array cited the same chunk id repeatedly,
  // which (before this dedup) rendered the same quoted line 2-3 times in
  // the generated report for no informational gain.
  const evidenceExtractor = async () => ({
    evidenceByCompetency: [
      {
        competencyId: "TECH-PROF",
        snippets: [
          { text: "Helped clean spreadsheet data for a client project.", sourceChunkId: "cv-015-chunk-0" },
          { text: "Shadowed senior analysts during client calls.", sourceChunkId: "cv-015-chunk-0" },
        ],
      },
    ],
  });
  const rubricScorer = async () => ({
    scores: [
      {
        competencyId: "TECH-PROF",
        value: 2,
        rationale: "x",
        evidenceChunkIds: ["cv-015-chunk-0", "cv-015-chunk-0", "cv-015-chunk-0"],
      },
    ],
  });
  const extractRedactScore = createExtractRedactScoreWorkflow({ evidenceExtractor, rubricScorer, ...stubRepos() });

  const result = await extractRedactScore({ candidateHandle: "CAND-015", rubricId: "rubric-x" });

  assert.equal(result.scores[0].evidenceSnippets.length, 2);
  assert.deepEqual(
    result.scores[0].evidenceSnippets.map((s) => s.text),
    ["Helped clean spreadsheet data for a client project.", "Shadowed senior analysts during client calls."],
  );
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
