import { test } from "node:test";
import assert from "node:assert/strict";

import { FallbackLLMProvider } from "../../src/adapters/llm/FallbackLLMProvider.js";

function stubProvider(behavior) {
  return { complete: behavior };
}

test("uses the first provider's result when it succeeds", async () => {
  const primary = stubProvider(async () => ({ text: "from primary" }));
  const secondary = stubProvider(async () => {
    throw new Error("should never be called");
  });
  const chain = new FallbackLLMProvider([
    { name: "primary", provider: primary },
    { name: "secondary", provider: secondary },
  ]);

  const result = await chain.complete({ prompt: "hi" });
  assert.equal(result.text, "from primary");
});

test("falls through to the next provider when the first fails", async () => {
  const primary = stubProvider(async () => {
    throw new Error("primary down");
  });
  const secondary = stubProvider(async () => ({ text: "from secondary" }));
  const chain = new FallbackLLMProvider([
    { name: "primary", provider: primary },
    { name: "secondary", provider: secondary },
  ]);

  const result = await chain.complete({ prompt: "hi" });
  assert.equal(result.text, "from secondary");
});

test("throws with every provider's failure message when all providers fail", async () => {
  const primary = stubProvider(async () => {
    throw new Error("primary down");
  });
  const secondary = stubProvider(async () => {
    throw new Error("secondary down");
  });
  const chain = new FallbackLLMProvider([
    { name: "primary", provider: primary },
    { name: "secondary", provider: secondary },
  ]);

  await assert.rejects(() => chain.complete({ prompt: "hi" }), /primary down.*secondary down/s);
});

test("constructing with zero providers throws immediately", () => {
  assert.throws(() => new FallbackLLMProvider([]));
});
