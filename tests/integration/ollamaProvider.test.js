import { test } from "node:test";
import assert from "node:assert/strict";
import "dotenv/config";

import { OllamaProvider } from "../../src/adapters/llm/OllamaProvider.js";

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";

// Same rationale as tests/integration/ollamaEmbeddingProvider.test.js: CI
// runs no Ollama service, so these skip gracefully rather than failing red.
// Every network-touching test below carries the { skip } guard — a missing
// guard on one test in this exact file pattern caused a real CI failure in
// Phase 2 (see docs/AI-USAGE-LOG.md).
async function isOllamaReachable() {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

const skip = (await isOllamaReachable())
  ? false
  : `Ollama not reachable at ${OLLAMA_HOST} — run locally with \`docker compose up -d ollama && docker compose run --rm ollama-pull\` to exercise this suite`;

const provider = new OllamaProvider({
  host: OLLAMA_HOST,
  model: process.env.OLLAMA_MODEL ?? "llama3.2:3b",
});

test("complete() returns real generated text for a plain prompt", { skip }, async () => {
  const result = await provider.complete({ prompt: "Reply with exactly the single word: pong" });
  assert.equal(typeof result.text, "string");
  assert.ok(result.text.length > 0);
});

test("complete() honors a system prompt", { skip }, async () => {
  const result = await provider.complete({
    system: "You always reply with exactly one word and nothing else.",
    prompt: "What is the capital of France?",
  });
  assert.ok(result.text.trim().length > 0);
  assert.ok(result.text.trim().split(/\s+/).length <= 3); // small model leeway, not a strict single-word assertion
});

test("stream() yields real incremental deltas ending in a done event with real token counts", { skip }, async () => {
  const deltas = [];
  let doneEvent;
  for await (const event of provider.stream({ prompt: "Count from one to five." })) {
    if (event.type === "delta") deltas.push(event.text);
    else doneEvent = event;
  }

  assert.ok(deltas.length > 0, "expected at least one real streamed delta");
  assert.ok(deltas.join("").trim().length > 0);
  assert.ok(doneEvent, "expected exactly one done event");
  assert.ok(doneEvent.tokensIn > 0);
  assert.ok(doneEvent.tokensOut > 0);
});
