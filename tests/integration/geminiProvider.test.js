import { test } from "node:test";
import assert from "node:assert/strict";
import "dotenv/config";

import { GeminiProvider } from "../../src/adapters/llm/GeminiProvider.js";

// Gemini is the hosted secondary provider (ADR-0005) — CI has no
// GEMINI_API_KEY secret configured, and these tests must never fail red for
// its absence. Every network-touching test below carries the { skip } guard;
// a missing guard on one test in this file's Ollama-equivalent pattern
// caused a real CI failure in Phase 2 — checked deliberately here.
const apiKey = process.env.GEMINI_API_KEY;
const skip = apiKey ? false : "GEMINI_API_KEY not set — export a real key to exercise this suite";

const provider = apiKey ? new GeminiProvider({ apiKey, model: process.env.GEMINI_MODEL ?? "gemini-1.5-flash" }) : null;

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
});

test("stream() yields real incremental deltas ending in a done event", { skip }, async () => {
  const deltas = [];
  let doneEvent;
  for await (const event of provider.stream({ prompt: "Count from one to five." })) {
    if (event.type === "delta") deltas.push(event.text);
    else doneEvent = event;
  }

  assert.ok(deltas.length > 0, "expected at least one real streamed delta");
  assert.ok(deltas.join("").trim().length > 0);
  assert.ok(doneEvent, "expected exactly one done event");
});
