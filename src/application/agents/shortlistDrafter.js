import { ShortlistDrafterInputSchema, ShortlistDrafterOutputSchema, ShortlistDrafterOutputJsonSchema } from "../../contracts/agents.js";
import { runStructuredCompletion } from "../completion/runStructuredCompletion.js";
import { renderTemplate } from "../prompts/renderTemplate.js";

// A pure scores-to-shortlist transform — calls no tool at all, same as the
// Rubric Scorer.
export const SHORTLIST_DRAFTER_ALLOWED_TOOLS = Object.freeze([]);

function formatCandidateBlocks(candidates) {
  return candidates
    .map(({ candidateHandle, compositeScore, scores }) => {
      const scoresText = scores.map((s) => `  ${s.competencyId}: ${s.value} — ${s.rationale}`).join("\n");
      return `${candidateHandle} (composite: ${compositeScore})\n${scoresText}`;
    })
    .join("\n\n");
}

export function createShortlistDrafterAgent({ llmProvider, promptTemplate, systemPrompt }) {
  return async function shortlistDrafter(rawInput) {
    const input = ShortlistDrafterInputSchema.parse(rawInput);

    const prompt = renderTemplate(promptTemplate, {
      roleId: input.roleId,
      candidateBlocks: formatCandidateBlocks(input.candidates),
    });

    // Bound to THIS call's actual candidate set — a candidateHandle the
    // model wasn't given (invented, or copied wrong) is rejected and
    // triggers a retry rather than silently ranking a nonexistent candidate.
    const knownHandles = new Set(input.candidates.map((c) => c.candidateHandle));
    const scopedOutputSchema = ShortlistDrafterOutputSchema.refine(
      (data) => data.shortlist.every((entry) => knownHandles.has(entry.candidateHandle)),
      { message: "every candidateHandle in the shortlist must be one of the input candidates" },
    );

    return runStructuredCompletion({
      llmProvider,
      zodSchema: scopedOutputSchema,
      jsonSchema: ShortlistDrafterOutputJsonSchema,
      system: systemPrompt,
      prompt,
    });
  };
}
