import { EvidenceExtractorInputSchema, EvidenceExtractorOutputSchema, EvidenceExtractorOutputJsonSchema } from "../../contracts/agents.js";
import { InsufficientEvidenceError, NotFoundError } from "../../domain/errors/index.js";
import { runStructuredCompletion } from "../completion/runStructuredCompletion.js";
import { renderTemplate } from "../prompts/renderTemplate.js";

// The only tool this agent may call — deliberately candidate-scoped, never
// search_corpus, so evidence gathering can't cross-contaminate between
// candidates (ADR-0001's metadata-filtering rationale, extended here).
export const EVIDENCE_EXTRACTOR_ALLOWED_TOOLS = Object.freeze(["get_candidate_chunks"]);

function formatCompetencies(competencies) {
  return competencies.map((c) => `${c.id} — ${c.name}: ${c.description}`).join("\n");
}

function formatChunks(chunks) {
  return chunks.map((c) => `[chunkId: ${c.chunkId}]\n${c.content}`).join("\n\n");
}

// Whitespace/case-insensitive containment, not exact-string containment —
// the model quotes verbatim spans in practice (verified against real corpus
// CVs) but sometimes normalizes internal whitespace when copying across a
// line break. Never fuzzy/similarity matching: this must stay a mechanical
// yes/no check, not a judgment call an LLM could be argued into.
function normalizeForContainment(text) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function isGroundedInChunk(snippetText, chunkContent) {
  // chunkContent is undefined when sourceChunkId isn't a known chunk at all —
  // the sibling .refine() above already flags that case with a more specific
  // message, but this still fails closed (false, not true) rather than
  // treating "I can't even find the chunk" as grounded.
  if (chunkContent === undefined) return false;
  return normalizeForContainment(chunkContent).includes(normalizeForContainment(snippetText));
}

export function createEvidenceExtractorAgent({ llmProvider, competencyRepository, callTool, promptTemplate, systemPrompt }) {
  return async function evidenceExtractor(rawInput) {
    const input = EvidenceExtractorInputSchema.parse(rawInput);

    const { chunks } = await callTool("get_candidate_chunks", { candidateHandle: input.candidateHandle });
    if (chunks.length === 0) {
      throw new InsufficientEvidenceError(`No CV chunks found for candidate ${input.candidateHandle} — cannot extract evidence`);
    }

    const competencies = await Promise.all(input.competencyIds.map((id) => competencyRepository.findById(id)));
    const missingIndex = competencies.findIndex((c) => !c);
    if (missingIndex !== -1) {
      throw new NotFoundError("Competency", input.competencyIds[missingIndex]);
    }

    const prompt = renderTemplate(promptTemplate, {
      competencies: formatCompetencies(competencies),
      chunks: formatChunks(chunks),
    });

    // Bound to THIS call's actual fetched chunks — a sourceChunkId the model
    // didn't see is rejected and triggers a retry via runStructuredCompletion,
    // never trusted through. Never validate this as "does the schema shape
    // match," which a hallucinated-but-well-formed id would still pass.
    const knownChunkIds = new Set(chunks.map((c) => c.chunkId));
    const contentByChunkId = new Map(chunks.map((c) => [c.chunkId, c.content]));
    const scopedOutputSchema = EvidenceExtractorOutputSchema.refine(
      (data) => data.evidenceByCompetency.every((entry) => entry.snippets.every((snippet) => knownChunkIds.has(snippet.sourceChunkId))),
      { message: "every sourceChunkId must reference a chunk actually fetched for this candidate" },
    ).refine(
      // A real chunk id is necessary but not sufficient — this catches the
      // case a short/low-content chunk (an OCR chunk that only captured a
      // header line, for instance) gets cited for evidence its actual text
      // could never support. Confidence-threshold filtering in
      // get_candidate_chunks decides WHETHER a chunk is used; this decides
      // whether the model's claims about it are real.
      (data) => data.evidenceByCompetency.every((entry) => entry.snippets.every((snippet) => isGroundedInChunk(snippet.text, contentByChunkId.get(snippet.sourceChunkId)))),
      { message: "every snippet's text must actually appear in its cited chunk's content — a hallucinated-but-real chunk id is not grounding" },
    );

    return runStructuredCompletion({
      llmProvider,
      zodSchema: scopedOutputSchema,
      jsonSchema: EvidenceExtractorOutputJsonSchema,
      system: systemPrompt,
      prompt,
    });
  };
}
