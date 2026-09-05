import { GetCandidateChunksInputSchema, GetCandidateChunksOutputSchema } from "../../contracts/tools.js";
import { NotFoundError } from "../../domain/errors/index.js";

// candidateHandle (CAND-NNN, opaque) in, resolved to the internal
// candidates.id chunks.candidate_id actually stores — same pattern as
// answerQuestion.js's candidate scoping (Phase 3), so a public contract
// never carries an internal DB key.
export function createGetCandidateChunksTool({ vectorStore, candidateRepository }) {
  return async function getCandidateChunks(rawInput) {
    const { candidateHandle, section } = GetCandidateChunksInputSchema.parse(rawInput);
    const candidate = await candidateRepository.findByHandle(candidateHandle);
    if (!candidate) throw new NotFoundError("Candidate", candidateHandle);
    const chunks = await vectorStore.findByCandidateId(candidate.id, { section });
    return GetCandidateChunksOutputSchema.parse({ chunks });
  };
}
