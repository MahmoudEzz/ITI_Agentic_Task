import { ValidationError } from "../errors/index.js";

export function createScore({ candidateHandle, competencyId, value, scaleMin, scaleMax, rationale, evidenceChunkIds }) {
  if (!candidateHandle) throw new ValidationError("Score requires a candidateHandle");
  if (!competencyId) throw new ValidationError("Score requires a competencyId");
  if (typeof value !== "number" || value < scaleMin || value > scaleMax) {
    throw new ValidationError(`Score value must be within [${scaleMin}, ${scaleMax}] (got ${value})`);
  }
  if (!rationale || rationale.trim() === "") throw new ValidationError("Score requires a non-empty rationale");
  if (!Array.isArray(evidenceChunkIds) || evidenceChunkIds.length === 0) {
    throw new ValidationError("Score requires at least one evidenceChunkId — a score without a citation is not grounded");
  }

  return Object.freeze({ candidateHandle, competencyId, value, rationale, evidenceChunkIds: Object.freeze([...evidenceChunkIds]) });
}

// Weighted average of per-competency scores against a rubric's weights.
// Every competency the rubric names must have a score — a missing
// competency is a data-integrity bug, not something to silently skip
// (skipping would silently change what the composite represents).
export function compositeScore(scores, rubric) {
  const scoreByCompetency = new Map(scores.map((s) => [s.competencyId, s]));

  let weightedSum = 0;
  for (const { competencyId, weight } of rubric.competencyWeights) {
    const score = scoreByCompetency.get(competencyId);
    if (!score) {
      throw new ValidationError(`Missing score for competency ${competencyId} required by rubric ${rubric.id}`);
    }
    weightedSum += score.value * weight;
  }

  return weightedSum;
}
