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

// Shared by both the plain and streaming use cases below: embed -> hybrid
// retrieve -> deterministic refusal decision (before any LLM call, see
// decideRefusal.js/ADR-0001). Streaming can't defer this any further than
// the non-streaming path does — the refusal decision has to be made before
// the first token is ever sent, or a client would see a partial "stream"
// for a question that should have refused outright.
async function retrieveAndDecideRefusal({ embeddingProvider, vectorStore, candidateRepository, refusalThreshold, defaultTopK }, { question, topK, candidateHandle, documentType, section }) {
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
  return { chunks, refusal };
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
  return async function answerQuestion({ question, topK, candidateHandle, documentType, section, correlationId }) {
    const { chunks, refusal } = await retrieveAndDecideRefusal(
      { embeddingProvider, vectorStore, candidateRepository, refusalThreshold, defaultTopK },
      { question, topK, candidateHandle, documentType, section },
    );
    if (refusal.refused) {
      return AnswerSchema.parse({ refused: true, answer: null, refusalReason: refusal.reason });
    }

    const prompt = renderTemplate(promptTemplate, { context: buildContextBlock(chunks), question });
    // No run exists for a plain Q&A call — correlationId is whatever the
    // caller generated at request/script ingress (FR-9), runId stays null.
    const { text } = await llmProvider.complete({ system: systemPrompt, prompt }, { correlationId, span: "llm.answer_question" });
    const citations = resolveCitations(text, chunks);

    if (citations.length === 0) {
      return AnswerSchema.parse({ refused: true, answer: null, refusalReason: "insufficient_evidence" });
    }

    return AnswerSchema.parse({ refused: false, answer: text, citations });
  };
}

// FR-6's SSE prose-streaming path (ADR-0007) for the same Q&A slice above —
// identical retrieval/refusal logic, but the completion is streamed token
// by token via `onEvent` rather than returned as one value, since citations
// can only be resolved once the full text exists (resolveCitations needs
// the whole string, not a partial one), the final onEvent call carries the
// complete AnswerSchema-shaped result.
export function createAnswerQuestionStreamUseCase({
  embeddingProvider,
  vectorStore,
  llmProvider,
  candidateRepository,
  promptTemplate,
  systemPrompt,
  refusalThreshold,
  defaultTopK = 8,
}) {
  return async function answerQuestionStream({ question, topK, candidateHandle, documentType, section, correlationId, onEvent }) {
    const { chunks, refusal } = await retrieveAndDecideRefusal(
      { embeddingProvider, vectorStore, candidateRepository, refusalThreshold, defaultTopK },
      { question, topK, candidateHandle, documentType, section },
    );
    if (refusal.refused) {
      onEvent({ type: "answer", answer: AnswerSchema.parse({ refused: true, answer: null, refusalReason: refusal.reason }) });
      return;
    }

    const prompt = renderTemplate(promptTemplate, { context: buildContextBlock(chunks), question });
    let fullText = "";
    for await (const event of llmProvider.stream({ system: systemPrompt, prompt }, { correlationId, span: "llm.answer_question" })) {
      if (event.type === "delta") {
        fullText += event.text;
        onEvent({ type: "delta", text: event.text });
      }
    }

    const citations = resolveCitations(fullText, chunks);
    const answer =
      citations.length === 0
        ? AnswerSchema.parse({ refused: true, answer: null, refusalReason: "insufficient_evidence" })
        : AnswerSchema.parse({ refused: false, answer: fullText, citations });
    onEvent({ type: "answer", answer });
  };
}
