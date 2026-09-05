import { test } from "node:test";
import assert from "node:assert/strict";

import { createAnswerQuestionUseCase, createAnswerQuestionStreamUseCase } from "../../src/application/use-cases/answerQuestion.js";
import { NotFoundError } from "../../src/domain/errors/index.js";

const TEMPLATE = "CONTEXT:\n{{context}}\n\nQUESTION:\n{{question}}";

function stubDeps({ chunks, completeText }) {
  return {
    embeddingProvider: { embed: async () => [[0.1, 0.2, 0.3]] },
    vectorStore: { hybridSearch: async () => chunks },
    llmProvider: { complete: async () => ({ text: completeText }) },
    candidateRepository: { findByHandle: async (handle) => ({ id: handle.toLowerCase(), handle }) },
    promptTemplate: TEMPLATE,
    refusalThreshold: 0.35,
  };
}

test("refuses without calling the LLM when no retrieved chunk clears the threshold", async () => {
  let llmCalled = false;
  const deps = stubDeps({ chunks: [{ chunkId: "c1", documentId: "d1", content: "x", denseSimilarity: 0.1 }], completeText: "n/a" });
  deps.llmProvider.complete = async () => {
    llmCalled = true;
    return { text: "should not happen" };
  };

  const answerQuestion = createAnswerQuestionUseCase(deps);
  const result = await answerQuestion({ question: "Does CAND-001 know Rust?" });

  assert.equal(result.refused, true);
  assert.equal(result.refusalReason, "insufficient_evidence");
  assert.equal(llmCalled, false);
});

test("returns a grounded answer with citations resolved from real context markers", async () => {
  const chunks = [
    { chunkId: "c1", documentId: "d1", content: "5 years of Kubernetes experience.", denseSimilarity: 0.9, section: "Experience", page: 1 },
    { chunkId: "c2", documentId: "d2", content: "Unrelated content.", denseSimilarity: 0.5 },
  ];
  const deps = stubDeps({ chunks, completeText: "The candidate has 5 years of Kubernetes experience [1]." });

  const answerQuestion = createAnswerQuestionUseCase(deps);
  const result = await answerQuestion({ question: "Does the candidate know Kubernetes?" });

  assert.equal(result.refused, false);
  assert.equal(result.citations.length, 1);
  assert.equal(result.citations[0].chunkId, "c1");
  assert.equal(result.citations[0].section, "Experience");
});

test("drops a citation marker that doesn't map to a real context index", async () => {
  const chunks = [{ chunkId: "c1", documentId: "d1", content: "real content", denseSimilarity: 0.9 }];
  const deps = stubDeps({ chunks, completeText: "Some claim [1], and a fabricated one [7]." });

  const answerQuestion = createAnswerQuestionUseCase(deps);
  const result = await answerQuestion({ question: "x" });

  assert.equal(result.refused, false);
  assert.equal(result.citations.length, 1);
  assert.equal(result.citations[0].chunkId, "c1");
});

test("treats a citation-free response as a refusal even though retrieval passed the similarity gate", async () => {
  const chunks = [{ chunkId: "c1", documentId: "d1", content: "real content", denseSimilarity: 0.9 }];
  const deps = stubDeps({ chunks, completeText: "This answer cites nothing at all." });

  const answerQuestion = createAnswerQuestionUseCase(deps);
  const result = await answerQuestion({ question: "x" });

  assert.equal(result.refused, true);
  assert.equal(result.refusalReason, "insufficient_evidence");
});

test("resolves candidateHandle to the internal candidate id before filtering hybridSearch", async () => {
  let capturedOptions;
  const deps = stubDeps({ chunks: [{ chunkId: "c1", documentId: "d1", content: "x", denseSimilarity: 0.9 }], completeText: "answer [1]." });
  deps.vectorStore.hybridSearch = async (_query, _embedding, options) => {
    capturedOptions = options;
    return [{ chunkId: "c1", documentId: "d1", content: "x", denseSimilarity: 0.9 }];
  };

  const answerQuestion = createAnswerQuestionUseCase(deps);
  await answerQuestion({ question: "x", topK: 3, candidateHandle: "CAND-001", documentType: "cv", section: "Experience" });

  assert.deepEqual(capturedOptions, { topK: 3, candidateId: "cand-001", documentType: "cv", section: "Experience" });
});

test("throws NotFoundError for a candidateHandle that doesn't resolve to a real candidate, rather than silently searching unscoped", async () => {
  const deps = stubDeps({ chunks: [], completeText: "n/a" });
  deps.candidateRepository.findByHandle = async () => null;

  const answerQuestion = createAnswerQuestionUseCase(deps);
  await assert.rejects(() => answerQuestion({ question: "x", candidateHandle: "CAND-999" }), NotFoundError);
});

function stubStreamDeps({ chunks, deltas }) {
  const deps = stubDeps({ chunks, completeText: "n/a" });
  deps.llmProvider = {
    async *stream() {
      for (const text of deltas) yield { type: "delta", text };
      yield { type: "done", tokensIn: 10, tokensOut: 5 };
    },
  };
  return deps;
}

test("answerQuestionStream: refuses via a single onEvent, without ever calling stream()", async () => {
  const deps = stubStreamDeps({ chunks: [{ chunkId: "c1", documentId: "d1", content: "x", denseSimilarity: 0.1 }], deltas: ["should never happen"] });
  let streamCalled = false;
  // eslint-disable-next-line require-yield -- asserts stream() is never even called; nothing to yield
  deps.llmProvider.stream = async function* () {
    streamCalled = true;
  };

  const answerQuestionStream = createAnswerQuestionStreamUseCase(deps);
  const events = [];
  await answerQuestionStream({ question: "x", onEvent: (e) => events.push(e) });

  assert.equal(streamCalled, false);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "answer");
  assert.equal(events[0].answer.refused, true);
});

test("answerQuestionStream: forwards every real delta as it arrives, then one final answer event with resolved citations", async () => {
  const chunks = [{ chunkId: "c1", documentId: "d1", content: "5 years of Kubernetes experience.", denseSimilarity: 0.9, section: "Experience", page: 1 }];
  const deps = stubStreamDeps({ chunks, deltas: ["The candidate has ", "5 years of Kubernetes ", "experience [1]."] });

  const answerQuestionStream = createAnswerQuestionStreamUseCase(deps);
  const events = [];
  await answerQuestionStream({ question: "x", onEvent: (e) => events.push(e) });

  const deltaEvents = events.filter((e) => e.type === "delta");
  assert.deepEqual(deltaEvents.map((e) => e.text), ["The candidate has ", "5 years of Kubernetes ", "experience [1]."]);

  const finalEvent = events.at(-1);
  assert.equal(finalEvent.type, "answer");
  assert.equal(finalEvent.answer.refused, false);
  assert.equal(finalEvent.answer.answer, "The candidate has 5 years of Kubernetes experience [1].");
  assert.equal(finalEvent.answer.citations[0].chunkId, "c1");
});

test("answerQuestionStream: a citation-free streamed response still resolves as a refusal, same as the non-streaming path", async () => {
  const chunks = [{ chunkId: "c1", documentId: "d1", content: "real content", denseSimilarity: 0.9 }];
  const deps = stubStreamDeps({ chunks, deltas: ["This answer cites nothing at all."] });

  const answerQuestionStream = createAnswerQuestionStreamUseCase(deps);
  const events = [];
  await answerQuestionStream({ question: "x", onEvent: (e) => events.push(e) });

  const finalEvent = events.at(-1);
  assert.equal(finalEvent.answer.refused, true);
  assert.equal(finalEvent.answer.refusalReason, "insufficient_evidence");
});
