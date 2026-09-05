import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

import { runStructuredCompletion } from "../../src/application/completion/runStructuredCompletion.js";
import { StructuredOutputError } from "../../src/domain/errors/index.js";

const zodSchema = z.object({ snippets: z.array(z.string()).min(1), rationale: z.string().min(1) }).strict();
const jsonSchema = z.toJSONSchema(zodSchema);

function stubProvider(responses) {
  let call = 0;
  return {
    complete: async () => ({ text: responses[Math.min(call++, responses.length - 1)] }),
  };
}

test("returns validated data on the first attempt when the response is already valid", async () => {
  const llmProvider = stubProvider([JSON.stringify({ snippets: ["a"], rationale: "solid" })]);
  const result = await runStructuredCompletion({ llmProvider, zodSchema, jsonSchema, prompt: "x" });
  assert.deepEqual(result, { snippets: ["a"], rationale: "solid" });
});

test("retries on invalid JSON and succeeds on a later attempt", async () => {
  const llmProvider = stubProvider(["not json at all", JSON.stringify({ snippets: ["a"], rationale: "ok" })]);
  const result = await runStructuredCompletion({ llmProvider, zodSchema, jsonSchema, prompt: "x", maxAttempts: 3 });
  assert.deepEqual(result, { snippets: ["a"], rationale: "ok" });
});

// This is the realistic failure mode on a small local model with
// schema-constrained decoding: the shape is valid JSON matching the schema
// structurally, but content guards (.min(1) on the array) still fail — an
// empty snippets array is exactly what DEGRADED_DRAFT (issue #40) needs to
// actually be forced by, not merely a malformed-JSON case.
test("exhausts retries and throws StructuredOutputError on semantically-empty-but-schema-shaped JSON", async () => {
  const emptyButValidShape = JSON.stringify({ snippets: [], rationale: "" });
  const llmProvider = stubProvider([emptyButValidShape, emptyButValidShape, emptyButValidShape]);

  await assert.rejects(
    () => runStructuredCompletion({ llmProvider, zodSchema, jsonSchema, prompt: "x", maxAttempts: 3 }),
    StructuredOutputError,
  );
});

test("StructuredOutputError carries the attempt count and the last raw output for debugging", async () => {
  const llmProvider = stubProvider(["garbage"]);
  try {
    await runStructuredCompletion({ llmProvider, zodSchema, jsonSchema, prompt: "x", maxAttempts: 2 });
    assert.fail("expected rejection");
  } catch (error) {
    assert.ok(error instanceof StructuredOutputError);
    assert.equal(error.attempts, 2);
    assert.equal(error.lastRawOutput, "garbage");
  }
});
