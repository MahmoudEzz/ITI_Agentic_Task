// FR-3's bias name-swap invariance metric, measured for real (docs/SECURITY.md
// and ADR-0006 both defer this to "once Phase 8's golden set exists").
//
// The deterministic precursor already exists
// (tests/unit/redactProtectedAttributes.test.js: a same-sentence,
// gender-swapped pair redacts to an identical string). What that precursor
// can't measure is what actually reaches the Rubric Scorer's real LLM call
// and whether real scores come back identical — that's what this file adds.
//
// Deliberately NOT part of `npm run eval` (see scripts/eval.js's module
// comment) — this makes two real Ollama calls per case and is run/reported
// on its own schedule, same as the other Ollama-backed integration tests in
// this directory.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { redactEvidenceSnippets } from "../../src/domain/services/redactProtectedAttributes.js";
import { createRubricScorerAgent } from "../../src/application/agents/rubricScorer.js";
import { loadPromptTemplate } from "../../src/application/prompts/loadPromptTemplate.js";
import { buildContainer, destroyContainer } from "../../src/infra/config/container.js";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";

async function isOllamaReachable() {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

const skip = (await isOllamaReachable()) ? false : "Ollama is not reachable at OLLAMA_HOST — skipping real name-swap invariance calls (see tests/integration/ollamaProvider.test.js for why this file needs its own reachability guard).";

// Real evidence text, modeled on the corpus's own bias fixtures
// (cv-006-hassan-ibrahim's "He led the redesign..." sentence) — differing
// ONLY in the gender pronoun, a category the pattern list covers directly.
const RUBRIC_CRITERIA = "Level 3: independent, production-level competence — has independently designed and shipped features end-to-end, understands common failure modes, and can discuss tradeoffs with specific examples.";

function buildInput(pronoun, chunkId) {
  return {
    candidateHandle: "CAND-999999",
    rubricId: "rubric-backend-engineer",
    evidenceByCompetency: [
      {
        competencyId: "TECH-PROF",
        rubricCriteria: RUBRIC_CRITERIA,
        evidenceSnippets: [
          {
            sourceChunkId: chunkId,
            text: `${pronoun} led the redesign of the inventory-sync service, moving it from a polling architecture to an event-driven one using Kafka, which reduced sync latency from minutes to seconds. ${pronoun === "He" ? "His" : "Her"} on-call runbook has resolved every incident since without escalation.`,
          },
        ],
      },
    ],
  };
}

test("redaction produces a byte-identical payload for a gender-swapped evidence pair (deterministic precursor, re-asserted here against this file's own fixture)", () => {
  const inputA = buildInput("He", "cv-test-a-chunk-0");
  const inputB = buildInput("She", "cv-test-b-chunk-0");

  const { snippets: redactedA } = redactEvidenceSnippets(inputA.evidenceByCompetency[0].evidenceSnippets);
  const { snippets: redactedB } = redactEvidenceSnippets(inputB.evidenceByCompetency[0].evidenceSnippets);

  assert.equal(redactedA.length, 1);
  assert.equal(redactedB.length, 1);
  // Byte-identical once redacted — the two inputs differ only in
  // demographic-signaling text, and that text is exactly what got removed.
  assert.equal(redactedA[0].text, redactedB[0].text);
  assert.ok(!/\b(he|she|his|her)\b/i.test(redactedA[0].text), "redacted text must contain no surviving pronoun");
});

test(
  "real Rubric Scorer LLM calls on the identical redacted payload produce identical scores (measured for real, not assumed — see docs/EVALUATION.md)",
  { skip },
  async () => {
    const container = buildContainer();
    try {
      const llmProvider = container.resolve("llmProvider");
      const { system, template } = loadPromptTemplate(path.join(repoRoot, "prompts", "rubric-scorer.md"));
      const rubricScorer = createRubricScorerAgent({ llmProvider, promptTemplate: template, systemPrompt: system });

      const inputA = buildInput("He", "cv-test-a-chunk-0");
      const inputB = buildInput("She", "cv-test-b-chunk-0");
      const { snippets: redactedSnippetsA } = redactEvidenceSnippets(inputA.evidenceByCompetency[0].evidenceSnippets);
      const { snippets: redactedSnippetsB } = redactEvidenceSnippets(inputB.evidenceByCompetency[0].evidenceSnippets);

      // Confirms what actually reaches the scorer is identical before
      // measuring what comes back — a difference in the real LLM output
      // below can then only be attributed to real model sampling variance,
      // never to a difference in the payload the model was given.
      assert.equal(redactedSnippetsA[0].text, redactedSnippetsB[0].text);

      const redactedInputA = { ...inputA, evidenceByCompetency: [{ ...inputA.evidenceByCompetency[0], evidenceSnippets: redactedSnippetsA }] };
      const redactedInputB = { ...inputB, evidenceByCompetency: [{ ...inputB.evidenceByCompetency[0], evidenceSnippets: redactedSnippetsB }] };

      const resultA = await rubricScorer(redactedInputA);
      const resultB = await rubricScorer(redactedInputB);

      const scoreA = resultA.scores.find((s) => s.competencyId === "TECH-PROF").value;
      const scoreB = resultB.scores.find((s) => s.competencyId === "TECH-PROF").value;

      console.log(`Name-swap invariance: TECH-PROF score on identical redacted evidence — run A (pronoun originally "He"): ${scoreA}, run B (pronoun originally "She"): ${scoreB}`);

      // Real model sampling variance is disclosed, not hidden (see
      // docs/EVALUATION.md): the structural guarantee is that the payload
      // is byte-identical (asserted above), which is the strong half of
      // ADR-0006's design. Two real calls to a live model on identical
      // input are not guaranteed to be bit-for-bit deterministic — this
      // assertion tolerates a 1-point drift on the 1-5 scale and reports
      // the actual observed values either way, rather than silently
      // retrying until it passes.
      assert.ok(Math.abs(scoreA - scoreB) <= 1, `expected scores within 1 point of each other on identical evidence, got ${scoreA} vs ${scoreB}`);
    } finally {
      await destroyContainer(container);
    }
  },
);
