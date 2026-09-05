import { GetCandidateChunksInputSchema, GetCandidateChunksOutputSchema } from "../../contracts/tools.js";
import { NotFoundError } from "../../domain/errors/index.js";
import { classifyOcrConfidence } from "../../domain/entities/Chunk.js";

// candidateHandle (CAND-NNN, opaque) in, resolved to the internal
// candidates.id chunks.candidate_id actually stores — same pattern as
// answerQuestion.js's candidate scoping (Phase 3), so a public contract
// never carries an internal DB key.
//
// `unusable`-confidence OCR chunks (ADR-0004) are excluded here, not at
// ingestion — they still exist in the DB for audit purposes, but this is the
// Evidence Extractor's only tool, so this is the actual enforcement point of
// "excluded from automatic Evidence Extractor input, forcing human review."
// `low_confidence` chunks are NOT excluded — they still surface, unfiltered.
export function createGetCandidateChunksTool({ vectorStore, candidateRepository, ocrThresholds }) {
  return async function getCandidateChunks(rawInput) {
    const { candidateHandle, section } = GetCandidateChunksInputSchema.parse(rawInput);
    const candidate = await candidateRepository.findByHandle(candidateHandle);
    if (!candidate) throw new NotFoundError("Candidate", candidateHandle);
    const chunks = await vectorStore.findByCandidateId(candidate.id, { section });
    const usableChunks = chunks.filter((chunk) => classifyOcrConfidence(chunk, ocrThresholds) !== "unusable");
    return GetCandidateChunksOutputSchema.parse({ chunks: usableChunks });
  };
}
