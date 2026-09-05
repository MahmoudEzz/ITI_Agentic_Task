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

async function collect(asyncIterable) {
  const events = [];
  for await (const event of asyncIterable) events.push(event);
  return events;
}

function stubStreamProvider(behavior) {
  return { stream: behavior };
}

test("stream(): uses the first provider's deltas when it succeeds", async () => {
  const primary = stubStreamProvider(async function* () {
    yield { type: "delta", text: "hi" };
    yield { type: "done", tokensIn: 1, tokensOut: 1 };
  });
  // eslint-disable-next-line require-yield -- see the comment on the other "never called" stub below
  const secondary = stubStreamProvider(async function* () {
    throw new Error("should never be called");
  });
  const chain = new FallbackLLMProvider([
    { name: "primary", provider: primary },
    { name: "secondary", provider: secondary },
  ]);

  const events = await collect(chain.stream({ prompt: "hi" }));
  assert.deepEqual(events, [{ type: "delta", text: "hi" }, { type: "done", tokensIn: 1, tokensOut: 1 }]);
});

test("stream(): falls through to the next provider when the first fails before yielding anything", async () => {
  // A real provider adapter is an async generator function — calling it
  // returns an iterator synchronously, and the error is only thrown once
  // iteration actually starts. A plain async function would instead throw
  // on the call itself, exercising a different (non-iterable) code path
  // than production ever hits — this stub has to match that shape.
  // eslint-disable-next-line require-yield
  const primary = stubStreamProvider(async function* () {
    throw new Error("primary down");
  });
  const secondary = stubStreamProvider(async function* () {
    yield { type: "delta", text: "from secondary" };
    yield { type: "done", tokensIn: 1, tokensOut: 1 };
  });
  const chain = new FallbackLLMProvider([
    { name: "primary", provider: primary },
    { name: "secondary", provider: secondary },
  ]);

  const events = await collect(chain.stream({ prompt: "hi" }));
  assert.equal(events[0].text, "from secondary");
});

test("stream(): once a delta has been yielded, a later failure from the same provider propagates instead of silently retrying", async () => {
  const primary = stubStreamProvider(async function* () {
    yield { type: "delta", text: "partial" };
    throw new Error("connection dropped mid-stream");
  });
  const secondary = stubStreamProvider(async function* () {
    yield { type: "delta", text: "should never be reached" };
  });
  const chain = new FallbackLLMProvider([
    { name: "primary", provider: primary },
    { name: "secondary", provider: secondary },
  ]);

  const events = [];
  await assert.rejects(async () => {
    for await (const event of chain.stream({ prompt: "hi" })) events.push(event);
  }, /connection dropped mid-stream/);
  assert.deepEqual(events, [{ type: "delta", text: "partial" }]);
});
