import { test } from "node:test";
import assert from "node:assert/strict";

import { RetrievalQuerySchema, CitationSchema, AnswerSchema } from "../../src/contracts/retrieval.js";

test("RetrievalQuerySchema accepts a bare question with no filters", () => {
  const result = RetrievalQuerySchema.safeParse({ question: "Does CAND-001 have Kubernetes experience?" });
  assert.equal(result.success, true);
});

test("RetrievalQuerySchema rejects an unknown field", () => {
  const result = RetrievalQuerySchema.safeParse({ question: "x", extra: "not allowed" });
  assert.equal(result.success, false);
});

test("RetrievalQuerySchema accepts a well-formed candidateHandle and rejects a malformed one", () => {
  assert.equal(RetrievalQuerySchema.safeParse({ question: "x", candidateHandle: "CAND-001" }).success, true);
  assert.equal(RetrievalQuerySchema.safeParse({ question: "x", candidateHandle: "Ahmed Youssef" }).success, false);
});

test("AnswerSchema accepts a non-refused answer with at least one citation", () => {
  const result = AnswerSchema.safeParse({
    refused: false,
    answer: "CAND-001 has 3 years of Kubernetes experience [1].",
    citations: [{ chunkId: "c1", documentId: "d1", section: "Experience", page: 1 }],
  });
  assert.equal(result.success, true);
});

test("AnswerSchema rejects a non-refused answer with zero citations — no claim without a citation", () => {
  const result = AnswerSchema.safeParse({ refused: false, answer: "Some claim.", citations: [] });
  assert.equal(result.success, false);
});

test("AnswerSchema rejects a non-refused answer carrying a refusalReason field", () => {
  const result = AnswerSchema.safeParse({
    refused: false,
    answer: "x",
    citations: [{ chunkId: "c1", documentId: "d1" }],
    refusalReason: "insufficient_evidence",
  });
  assert.equal(result.success, false);
});

test("AnswerSchema accepts a refused answer with null answer and no citations field", () => {
  const result = AnswerSchema.safeParse({ refused: true, answer: null, refusalReason: "insufficient_evidence" });
  assert.equal(result.success, true);
});

test("AnswerSchema rejects a refused answer that still carries an answer string", () => {
  const result = AnswerSchema.safeParse({ refused: true, answer: "should be null", refusalReason: "insufficient_evidence" });
  assert.equal(result.success, false);
});

test("CitationSchema allows omitting section/page but rejects unknown fields", () => {
  assert.equal(CitationSchema.safeParse({ chunkId: "c1", documentId: "d1" }).success, true);
  assert.equal(CitationSchema.safeParse({ chunkId: "c1", documentId: "d1", extra: "no" }).success, false);
});
