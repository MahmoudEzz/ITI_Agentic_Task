import { StructuredOutputError } from "../../domain/errors/index.js";

// Schema-constrained decoding (the provider's `format`/`responseSchema`
// field) is the PRIMARY mechanism for getting well-formed output — this
// retry loop is a backstop for the realistic residual failure mode on a
// small local model: semantically empty but schema-valid JSON (an empty
// array, a placeholder rationale) that fails the Zod schema's *content*
// guards (.min(1), non-empty strings) even though the shape was fine. It is
// deliberately not the primary reliability mechanism (ADR-0005).
//
// `zodSchema`/`jsonSchema` are both passed in as already-built objects
// (see contracts/agents.js) — this file never imports zod itself, so
// application code that needs schema validation still only ever touches
// contracts' pre-built schema instances, same as answerQuestion.js.
export async function runStructuredCompletion({ llmProvider, zodSchema, jsonSchema, system, prompt, maxAttempts = 3 }) {
  let lastRawOutput = null;
  let lastIssues = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { text } = await llmProvider.complete({ system, prompt, schema: jsonSchema });
    lastRawOutput = text;

    let parsedJson;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      lastIssues = "response was not valid JSON";
      continue;
    }

    const result = zodSchema.safeParse(parsedJson);
    if (result.success) return result.data;
    lastIssues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  }

  throw new StructuredOutputError(`Structured completion failed validation after ${maxAttempts} attempts: ${lastIssues}`, {
    attempts: maxAttempts,
    lastRawOutput,
  });
}
