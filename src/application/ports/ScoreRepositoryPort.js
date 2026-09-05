// Port (interface) — implemented by src/adapters/relational/KnexScoreRepository.js.
export class ScoreRepositoryPort {
  // scores: RubricScorerOutputSchema.scores — never carries its own
  // candidateHandle (the schema is scoped to one candidate per call), so
  // it's a separate argument here rather than a per-score field.
  async createMany(_runId, _candidateHandle, _scores) {
    throw new Error("ScoreRepositoryPort.createMany not implemented");
  }

  async findByRunAndCandidate(_runId, _candidateHandle) {
    throw new Error("ScoreRepositoryPort.findByRunAndCandidate not implemented");
  }
}
