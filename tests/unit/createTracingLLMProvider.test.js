import { test } from "node:test";
import assert from "node:assert/strict";

import { createTracingLLMProvider } from "../../src/application/tracing/createTracingLLMProvider.js";

function stubRepo() {
  const events = [];
  return { events, create: async (event) => events.push(event) };
}

test("createTracingLLMProvider forwards the real request and returns the real response text unchanged", async () => {
  const traceEventRepository = stubRepo();
  const inner = { complete: async (request) => ({ text: `echo:${request.prompt}`, tokensIn: 3, tokensOut: 2 }) };
  const provider = createTracingLLMProvider({ llmProvider: inner, traceEventRepository });

  const result = await provider.complete({ prompt: "hi" }, { correlationId: "corr-1", runId: "run-1", span: "llm.evidence_extractor" });

  assert.equal(result.text, "echo:hi");
});

test("createTracingLLMProvider records a real trace_events-shaped row with tokens and a real (0) cost", async () => {
  const traceEventRepository = stubRepo();
  const inner = { complete: async () => ({ text: "x", tokensIn: 100, tokensOut: 40 }) };
  const provider = createTracingLLMProvider({ llmProvider: inner, traceEventRepository });

  await provider.complete({ prompt: "hi" }, { correlationId: "corr-1", runId: "run-1", span: "llm.rubric_scorer" });

  assert.equal(traceEventRepository.events.length, 1);
  const [event] = traceEventRepository.events;
  assert.equal(event.correlationId, "corr-1");
  assert.equal(event.runId, "run-1");
  assert.equal(event.span, "llm.rubric_scorer");
  assert.equal(event.tokensIn, 100);
  assert.equal(event.tokensOut, 40);
  assert.equal(event.costUsd, 0);
});

test("createTracingLLMProvider defaults the span to llm.complete when the caller doesn't name one", async () => {
  const traceEventRepository = stubRepo();
  const inner = { complete: async () => ({ text: "x" }) };
  const provider = createTracingLLMProvider({ llmProvider: inner, traceEventRepository });

  await provider.complete({ prompt: "hi" });

  assert.equal(traceEventRepository.events[0].span, "llm.complete");
});

async function collect(asyncIterable) {
  const events = [];
  for await (const event of asyncIterable) events.push(event);
  return events;
}

test("createTracingLLMProvider.stream() forwards every delta immediately, unchanged", async () => {
  const traceEventRepository = stubRepo();
  const inner = {
    async *stream() {
      yield { type: "delta", text: "a" };
      yield { type: "delta", text: "b" };
      yield { type: "done", tokensIn: 7, tokensOut: 3 };
    },
  };
  const provider = createTracingLLMProvider({ llmProvider: inner, traceEventRepository });

  const events = await collect(provider.stream({ prompt: "hi" }, { correlationId: "corr-1", span: "llm.stream" }));
  assert.deepEqual(events, [
    { type: "delta", text: "a" },
    { type: "delta", text: "b" },
    { type: "done", tokensIn: 7, tokensOut: 3 },
  ]);
});

test("createTracingLLMProvider.stream() records one real trace_events row with the final token counts and a real (0) cost", async () => {
  const traceEventRepository = stubRepo();
  const inner = {
    async *stream() {
      yield { type: "delta", text: "a" };
      yield { type: "done", tokensIn: 100, tokensOut: 40 };
    },
  };
  const provider = createTracingLLMProvider({ llmProvider: inner, traceEventRepository });

  await collect(provider.stream({ prompt: "hi" }, { correlationId: "corr-1", runId: "run-1", span: "llm.stream" }));

  assert.equal(traceEventRepository.events.length, 1);
  const [event] = traceEventRepository.events;
  assert.equal(event.correlationId, "corr-1");
  assert.equal(event.runId, "run-1");
  assert.equal(event.span, "llm.stream");
  assert.equal(event.tokensIn, 100);
  assert.equal(event.tokensOut, 40);
  assert.equal(event.costUsd, 0);
});

test("createTracingLLMProvider.stream() still records a (failed) span and re-throws when the inner stream breaks mid-way", async () => {
  const traceEventRepository = stubRepo();
  const inner = {
    async *stream() {
      yield { type: "delta", text: "partial" };
      throw new Error("boom");
    },
  };
  const provider = createTracingLLMProvider({ llmProvider: inner, traceEventRepository });

  const seen = [];
  await assert.rejects(async () => {
    for await (const event of provider.stream({ prompt: "hi" }, { correlationId: "corr-1", span: "llm.stream" })) seen.push(event);
  }, /boom/);

  assert.deepEqual(seen, [{ type: "delta", text: "partial" }]);
  assert.equal(traceEventRepository.events.length, 1);
  assert.equal(traceEventRepository.events[0].attributes.error, "boom");
});
