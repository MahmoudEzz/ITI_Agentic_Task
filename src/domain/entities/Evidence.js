import { ValidationError, InsufficientEvidenceError } from "../errors/index.js";

// candidateId here is the opaque handle (e.g. "CAND-07"), never the
// Candidate entity itself — this is what the Rubric Scorer receives, and it
// must be structurally incapable of carrying a name. See ADR-0004.
export function createEvidence({ candidateHandle, competencyId, snippets }) {
  if (!candidateHandle) throw new ValidationError("Evidence requires a candidateHandle");
  if (!competencyId) throw new ValidationError("Evidence requires a competencyId");
  if (!Array.isArray(snippets) || snippets.length === 0) {
    // Not a bug — this is the grounded/refuse-correctly binding principle
    // applied to the evidence-gathering step itself.
    throw new InsufficientEvidenceError(
      `No evidence found for candidate ${candidateHandle} on competency ${competencyId}`,
    );
  }
  for (const snippet of snippets) {
    if (!snippet.text || snippet.text.trim() === "") throw new ValidationError("Evidence snippet requires non-empty text");
    if (!snippet.sourceChunkId) throw new ValidationError("Evidence snippet requires a sourceChunkId (citation traceability)");
  }

  return Object.freeze({
    candidateHandle,
    competencyId,
    snippets: Object.freeze(snippets.map((s) => Object.freeze({ ...s }))),
  });
}
