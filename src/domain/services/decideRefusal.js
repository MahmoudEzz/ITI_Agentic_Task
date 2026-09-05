// Deterministic, similarity-threshold-based refusal (FR-2's business rule:
// "if evidence is insufficient, the system must refuse rather than infer").
// This runs BEFORE any LLM call — refusal is a retrieval-time decision, not
// the model's own self-assessment, so it's reproducible and testable in the
// eval harness (docs/EVALUATION.md) without depending on model behavior.
//
// Thresholds on `denseSimilarity` only, never the fused RRF `score` — RRF's
// rank-position score (~1/(60+rank)) carries no confidence magnitude and
// would make this decision meaningless (see ADR-0001, PgVectorStore.hybridSearch).
// A keyword-only match (denseSimilarity: null) never on its own avoids
// refusal — kept to one number and one threshold, deliberately, so the
// decision stays defensible in the eval harness and explainable in one
// sentence (see ADR-0001's "Alternatives considered").

export function decideRefusal(retrievedChunks, { threshold }) {
  const bestDenseSimilarity = retrievedChunks.reduce((best, chunk) => Math.max(best, chunk.denseSimilarity ?? 0), 0);

  if (bestDenseSimilarity < threshold) {
    return {
      refused: true,
      reason: "insufficient_evidence",
      bestDenseSimilarity,
    };
  }

  return { refused: false, bestDenseSimilarity };
}
