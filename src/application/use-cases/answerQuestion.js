import { decideRefusal } from "../../domain/services/decideRefusal.js";
import { AnswerSchema } from "../../contracts/retrieval.js";
import { NotFoundError } from "../../domain/errors/index.js";
import { renderTemplate } from "../prompts/renderTemplate.js";

// Every entry gets a stable [n] marker matching its position — the same
// numbering the prompt instructs the model to cite by, and the only
// numbering resolveCitations() below trusts back.
function buildContextBlock(chunks) {
  return chunks
    .map((chunk, i) => {
      const meta = [chunk.section && `section: ${chunk.section}`, chunk.page && `page: ${chunk.page}`].filter(Boolean).join(", ");
      return `[${i + 1}] (document: ${chunk.documentId}${meta ? `, ${meta}` : ""})\n${chunk.content}`;
    })
    .join("\n\n");
}

// Resolves the model's [n] markers back to the actual chunks placed in
// context — a citation is only ever a chunk the model was actually given,
// never text the model invented. A marker with no matching context index is
// dropped rather than trusted (see BR-08: no claim without a real citation).
function resolveCitations(answerText, chunks) {
  const citedIndexes = new Set();
  for (const match of answerText.matchAll(/\[(\d+)\]/g)) {
    const index = Number(match[1]) - 1;
    if (index >= 0 && index < chunks.length) citedIndexes.add(index);
  }
  return [...citedIndexes]
    .sort((a, b) => a - b)
    .map((i) => ({
      chunkId: chunks[i].chunkId,
      documentId: chunks[i].documentId,
      section: chunks[i].section ?? null,
      page: chunks[i].page ?? null,
    }));
}

// FR-2's Q&A slice: embed -> hybrid retrieve -> deterministic refusal
// decision (before any LLM call, see decideRefusal.js/ADR-0001) -> grounded
// completion -> resolve citations from what was actually retrieved. A
// citation-free response is treated as a refusal rather than an ungrounded
// answer, even though retrieval passed the similarity gate — the gate says
// "plausibly relevant content exists," not "the model actually used it."
export function createAnswerQuestionUseCase({
  embeddingProvider,
  vectorStore,
  llmProvider,
  candidateRepository,
  promptTemplate,
  systemPrompt,
  refusalThreshold,
  defaultTopK = 8,
}) {
  return async function answerQuestion({ question, topK, candidateHandle, documentType, section }) {
    // candidateHandle (CAND-NNN, opaque) is the only candidate-scoping
    // identifier a caller may pass — resolved here to the internal
    // candidates.id that chunks.candidate_id actually stores, so this port
    // never leaks an internal DB key into a public contract.
    let candidateId;
    if (candidateHandle) {
      const candidate = await candidateRepository.findByHandle(candidateHandle);
      if (!candidate) throw new NotFoundError("Candidate", candidateHandle);
      candidateId = candidate.id;
    }

    const [embedding] = await embeddingProvider.embed([question]);
    const chunks = await vectorStore.hybridSearch(question, embedding, {
      topK: topK ?? defaultTopK,
      candidateId,
      documentType,
      section,
    });

    const refusal = decideRefusal(chunks, { threshold: refusalThreshold });
    if (refusal.refused) {
      return AnswerSchema.parse({ refused: true, answer: null, refusalReason: refusal.reason });
    }

    const prompt = renderTemplate(promptTemplate, { context: buildContextBlock(chunks), question });
    const { text } = await llmProvider.complete({ system: systemPrompt, prompt });
    const citations = resolveCitations(text, chunks);

    if (citations.length === 0) {
      return AnswerSchema.parse({ refused: true, answer: null, refusalReason: "insufficient_evidence" });
    }

    return AnswerSchema.parse({ refused: false, answer: text, citations });
  };
}
