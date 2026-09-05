import { RubricScorerInputSchema, RubricScorerOutputSchema, RubricScorerOutputJsonSchema } from "../../contracts/agents.js";
import { runStructuredCompletion } from "../completion/runStructuredCompletion.js";
import { renderTemplate } from "../prompts/renderTemplate.js";

// A pure evidence-to-score transform: everything it needs (evidence
// snippets, rubric criteria text) arrives as input. It calls no tool at
// all — tests/unit/rubricScorer.test.js proves a call attempted on its
// behalf through a scoped dispatcher with this empty list is rejected.
export const RUBRIC_SCORER_ALLOWED_TOOLS = Object.freeze([]);

function formatCompetencyBlocks(evidenceByCompetency) {
  return evidenceByCompetency
    .map(({ competencyId, rubricCriteria, evidenceSnippets }) => {
      const snippetsText = evidenceSnippets.map((s) => `  [chunkId: ${s.sourceChunkId}] ${s.text}`).join("\n");
      return `Competency ${competencyId}\nCriteria: ${rubricCriteria}\nEvidence:\n${snippetsText}`;
    })
    .join("\n\n");
}

export function createRubricScorerAgent({ llmProvider, promptTemplate, systemPrompt }) {
  return async function rubricScorer(rawInput, traceContext = {}) {
    // No name-carrying field exists on this schema at all (ADR-0006) — the
    // strongest half of the bias-safety design. The redaction pass that
    // must run on evidenceSnippets.text BEFORE this input is constructed
    // is the pipeline's job (src/application/workflows/), not this agent's;
    // this agent only ever sees whatever text it's handed.
    const input = RubricScorerInputSchema.parse(rawInput);

    const prompt = renderTemplate(promptTemplate, {
      candidateHandle: input.candidateHandle,
      competencyBlocks: formatCompetencyBlocks(input.evidenceByCompetency),
    });

    // Bound to THIS call's actual input evidence — an evidenceChunkId not
    // present in the evidence it was given is rejected and triggers a
    // retry, the same discipline answerQuestion.js applies to citations.
    const knownChunkIds = new Set(input.evidenceByCompetency.flatMap((e) => e.evidenceSnippets.map((s) => s.sourceChunkId)));
    // The output schema's `scores.min(1)` only guarantees at least one
    // score — nothing stops a small model from scoring only the first
    // competency it was given evidence for and calling it done (observed
    // for real against a live Ollama call). Require a score for every
    // competency it was actually given evidence for, or retry.
    const requiredCompetencyIds = new Set(input.evidenceByCompetency.map((e) => e.competencyId));
    const scopedOutputSchema = RubricScorerOutputSchema.refine(
      (data) => data.scores.every((score) => score.evidenceChunkIds.every((id) => knownChunkIds.has(id))),
      { message: "every evidenceChunkId must reference a chunk actually present in the input evidence" },
    ).refine(
      (data) => {
        const scoredCompetencyIds = new Set(data.scores.map((s) => s.competencyId));
        return [...requiredCompetencyIds].every((id) => scoredCompetencyIds.has(id));
      },
      { message: "every competency given evidence must receive a score — partial scoring is not allowed" },
    );

    return runStructuredCompletion({
      llmProvider,
      zodSchema: scopedOutputSchema,
      jsonSchema: RubricScorerOutputJsonSchema,
      system: systemPrompt,
      prompt,
      span: "llm.rubric_scorer",
      traceContext,
    });
  };
}
