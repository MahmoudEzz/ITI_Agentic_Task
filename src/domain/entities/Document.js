import { ValidationError } from "../errors/index.js";

export const DOCUMENT_TYPES = Object.freeze([
  "job_description",
  "competency_framework",
  "rubric",
  "cv",
  "policy",
  "process_guide",
]);

export function createDocument({ id, type, title, sourceFormat, version = 1, createdBy, candidateId = null }) {
  if (!id) throw new ValidationError("Document requires an id");
  if (!DOCUMENT_TYPES.includes(type)) {
    throw new ValidationError(`Document type must be one of ${DOCUMENT_TYPES.join(", ")} (got "${type}")`);
  }
  if (!title || title.trim() === "") throw new ValidationError("Document requires a non-empty title");
  if (!sourceFormat) throw new ValidationError("Document requires a sourceFormat (e.g. pdf, docx, txt)");
  if (!Number.isInteger(version) || version < 1) {
    throw new ValidationError("Document version must be a positive integer");
  }
  if (type === "cv" && !candidateId) {
    throw new ValidationError("A cv document must be attributed to a candidateId — retrieval scoping depends on it");
  }
  if (!createdBy) throw new ValidationError("Document requires createdBy (ownership scoping)");

  return Object.freeze({ id, type, title, sourceFormat, version, createdBy, candidateId });
}
