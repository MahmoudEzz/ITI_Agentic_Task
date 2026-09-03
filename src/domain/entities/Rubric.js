import { ValidationError } from "../errors/index.js";

const WEIGHT_SUM_TOLERANCE = 1e-6;

// competencyWeights: [{ competencyId, weight }], weights must sum to 1 —
// this is what makes compositeScore() in Score.js meaningful as a weighted
// average rather than an arbitrary sum.
export function createRubric({ id, roleId, competencyWeights, createdBy }) {
  if (!id) throw new ValidationError("Rubric requires an id");
  if (!roleId) throw new ValidationError("Rubric requires a roleId");
  if (!Array.isArray(competencyWeights) || competencyWeights.length === 0) {
    throw new ValidationError("Rubric requires at least one competency weight");
  }

  const seen = new Set();
  let weightSum = 0;
  for (const { competencyId, weight } of competencyWeights) {
    if (!competencyId) throw new ValidationError("Each rubric entry requires a competencyId");
    if (seen.has(competencyId)) throw new ValidationError(`Duplicate competencyId in rubric: ${competencyId}`);
    seen.add(competencyId);
    if (typeof weight !== "number" || weight <= 0) {
      throw new ValidationError(`Rubric weight for ${competencyId} must be a positive number (got ${weight})`);
    }
    weightSum += weight;
  }
  if (Math.abs(weightSum - 1) > WEIGHT_SUM_TOLERANCE) {
    throw new ValidationError(`Rubric competency weights must sum to 1 (got ${weightSum})`);
  }
  if (!createdBy) throw new ValidationError("Rubric requires createdBy (ownership scoping)");

  return Object.freeze({
    id,
    roleId,
    competencyWeights: Object.freeze(competencyWeights.map((w) => Object.freeze({ ...w }))),
    createdBy,
  });
}
