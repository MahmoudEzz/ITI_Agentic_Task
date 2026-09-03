import { ValidationError } from "../errors/index.js";

export function createChunk({
  id,
  documentId,
  content,
  section = null,
  page = null,
  charRange = null,
  candidateId = null,
  documentType,
  version = 1,
  chunkerVersion,
  ocrVersion = null,
  ocrConfidence = null,
}) {
  if (!id) throw new ValidationError("Chunk requires an id");
  if (!documentId) throw new ValidationError("Chunk requires a documentId");
  if (!content || content.trim() === "") throw new ValidationError("Chunk requires non-empty content");
  if (!documentType) throw new ValidationError("Chunk requires a documentType (denormalized for retrieval filtering)");
  if (!chunkerVersion) throw new ValidationError("Chunk requires a chunkerVersion (forces re-chunk on strategy change)");
  if (ocrConfidence !== null && (ocrConfidence < 0 || ocrConfidence > 100)) {
    throw new ValidationError(`Chunk ocrConfidence must be between 0 and 100 (got ${ocrConfidence})`);
  }

  return Object.freeze({
    id,
    documentId,
    content,
    section,
    page,
    charRange,
    candidateId,
    documentType,
    version,
    chunkerVersion,
    ocrVersion,
    ocrConfidence,
  });
}

// Pure classification against caller-supplied thresholds (config lives in
// infra/adapters, not here — see ADR-0004; thresholds are provisional and
// tuned once Phase 5 produces real OCR output).
export function classifyOcrConfidence(chunk, { lowConfidenceThreshold, unusableThreshold }) {
  if (chunk.ocrConfidence === null) return "native_text";
  if (chunk.ocrConfidence < unusableThreshold) return "unusable";
  if (chunk.ocrConfidence < lowConfidenceThreshold) return "low_confidence";
  return "confident";
}
