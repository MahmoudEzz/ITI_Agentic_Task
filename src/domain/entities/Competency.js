import { ValidationError } from "../errors/index.js";

// Behavioral anchors: one description per scale level, e.g. { 1: "...", 2: "...", ..., 5: "..." }.
export function createCompetency({ id, name, description, behavioralAnchors, scaleMin = 1, scaleMax = 5 }) {
  if (!id) throw new ValidationError("Competency requires an id");
  if (!name || name.trim() === "") throw new ValidationError("Competency requires a non-empty name");
  if (!description || description.trim() === "") throw new ValidationError("Competency requires a description");
  if (!Number.isInteger(scaleMin) || !Number.isInteger(scaleMax) || scaleMin >= scaleMax) {
    throw new ValidationError(`Competency scale must satisfy scaleMin < scaleMax (got ${scaleMin}, ${scaleMax})`);
  }
  const expectedLevels = scaleMax - scaleMin + 1;
  const providedLevels = Object.keys(behavioralAnchors ?? {}).length;
  if (providedLevels !== expectedLevels) {
    throw new ValidationError(
      `Competency behavioralAnchors must have exactly ${expectedLevels} levels (scale ${scaleMin}-${scaleMax}), got ${providedLevels}`,
    );
  }

  return Object.freeze({ id, name, description, behavioralAnchors: Object.freeze({ ...behavioralAnchors }), scaleMin, scaleMax });
}
