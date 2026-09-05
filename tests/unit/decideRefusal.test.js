import { test } from "node:test";
import assert from "node:assert/strict";

import { decideRefusal } from "../../src/domain/services/decideRefusal.js";

test("refuses when the best dense similarity is below threshold", () => {
  const result = decideRefusal([{ denseSimilarity: 0.2 }, { denseSimilarity: 0.1 }], { threshold: 0.35 });
  assert.equal(result.refused, true);
  assert.equal(result.reason, "insufficient_evidence");
});

test("does not refuse when the best dense similarity meets threshold", () => {
  const result = decideRefusal([{ denseSimilarity: 0.4 }, { denseSimilarity: 0.1 }], { threshold: 0.35 });
  assert.equal(result.refused, false);
});

test("does not refuse when the best dense similarity exactly equals threshold", () => {
  const result = decideRefusal([{ denseSimilarity: 0.35 }], { threshold: 0.35 });
  assert.equal(result.refused, false);
});

test("refuses on an empty retrieval result set", () => {
  const result = decideRefusal([], { threshold: 0.35 });
  assert.equal(result.refused, true);
});

test("a keyword-only match (null denseSimilarity) cannot on its own avoid refusal", () => {
  const result = decideRefusal([{ denseSimilarity: null }, { denseSimilarity: null }], { threshold: 0.35 });
  assert.equal(result.refused, true);
});

test("a mix of null and real dense similarities uses the best real value", () => {
  const result = decideRefusal([{ denseSimilarity: null }, { denseSimilarity: 0.5 }], { threshold: 0.35 });
  assert.equal(result.refused, false);
  assert.equal(result.bestDenseSimilarity, 0.5);
});
