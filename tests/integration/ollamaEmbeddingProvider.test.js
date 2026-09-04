import { test } from "node:test";
import assert from "node:assert/strict";
import "dotenv/config";

import { OllamaEmbeddingProvider } from "../../src/adapters/llm/OllamaEmbeddingProvider.js";

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";

// CI (see .github/workflows/ci.yml) deliberately runs no Ollama service —
// pulling its ~2.6GB image plus ~2.3GB of models on every PR would make CI
// slow for little benefit, given the assessment's own cost-conscious design
// philosophy (see docs/SYSTEM-DESIGN.md's OTel-vs-custom-trace-store
// precedent for the same kind of tradeoff). These tests require a real
// local Ollama and are meant to be run and verified locally (as they were
// for this PR); they skip gracefully, not silently, when Ollama isn't
// reachable, rather than either failing CI red or being deleted outright.
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
  : `Ollama not reachable at ${OLLAMA_HOST} — run locally with \`docker compose up -d ollama && docker compose run --rm ollama-pull\` to exercise this suite (see docs/SYSTEM-DESIGN.md)`;

const provider = new OllamaEmbeddingProvider({
  host: OLLAMA_HOST,
  model: process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text",
  batchSize: 2, // small on purpose, to actually exercise the multi-batch path below
});

test("embed() returns one real vector per input text, in the same order", { skip }, async () => {
  const [a, b] = await provider.embed(["hello world", "goodbye world"]);
  assert.ok(Array.isArray(a) && a.length > 0);
  assert.ok(Array.isArray(b) && b.length > 0);
  assert.equal(a.length, b.length); // same model, same dimensionality
});

test("embed() on an empty array returns an empty array without calling Ollama", async () => {
  assert.deepEqual(await provider.embed([]), []);
});

test("embed() splits a larger batch into multiple requests and still returns results in order", { skip }, async () => {
  const texts = ["one", "two", "three", "four", "five"]; // batchSize=2 forces 3 requests
  const vectors = await provider.embed(texts);
  assert.equal(vectors.length, texts.length);
  for (const vector of vectors) {
    assert.ok(Array.isArray(vector) && vector.length > 0);
  }
});

test("semantically similar text produces a higher cosine similarity than unrelated text", { skip }, async () => {
  const [backend, kubernetes, painting] = await provider.embed([
    "Backend engineer with experience in distributed systems",
    "Experienced with container orchestration and Kubernetes",
    "Skilled in watercolor painting and pottery",
  ]);

  const cosine = (x, y) => {
    let dot = 0,
      normX = 0,
      normY = 0;
    for (let i = 0; i < x.length; i++) {
      dot += x[i] * y[i];
      normX += x[i] * x[i];
      normY += y[i] * y[i];
    }
    return dot / (Math.sqrt(normX) * Math.sqrt(normY));
  };

  const relatedSimilarity = cosine(backend, kubernetes);
  const unrelatedSimilarity = cosine(backend, painting);
  assert.ok(relatedSimilarity > unrelatedSimilarity);
});
