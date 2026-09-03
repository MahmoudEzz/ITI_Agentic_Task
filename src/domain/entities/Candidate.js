import { ValidationError } from "../errors/index.js";

// Opaque handle format (e.g. "CAND-07") is deliberate: this is the only
// identifier that reaches the Rubric Scorer (see ADR-0004 / docs/SECURITY.md
// bias-safety design). A real name never flows through this entity's public
// shape into the scoring path.
const HANDLE_PATTERN = /^CAND-\d+$/;

export function createCandidate({ id, handle, fullName, createdBy, createdAt = new Date() }) {
  if (!id) throw new ValidationError("Candidate requires an id");
  if (!HANDLE_PATTERN.test(handle)) {
    throw new ValidationError(`Candidate handle must match ${HANDLE_PATTERN} (got "${handle}")`);
  }
  if (!fullName || typeof fullName !== "string" || fullName.trim() === "") {
    throw new ValidationError("Candidate requires a non-empty fullName");
  }
  if (!createdBy) throw new ValidationError("Candidate requires createdBy (ownership scoping)");

  return Object.freeze({ id, handle, fullName, createdBy, createdAt });
}

// The projection that is ever allowed to reach a scoring-related agent call —
// deliberately excludes fullName and createdBy.
export function toOpaqueHandle(candidate) {
  return Object.freeze({ handle: candidate.handle });
}
