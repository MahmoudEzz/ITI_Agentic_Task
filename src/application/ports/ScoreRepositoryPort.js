// Port (interface) — implemented by src/adapters/relational/KnexScoreRepository.js.
export class ScoreRepositoryPort {
  async createMany(_runId, _scores) {
    throw new Error("ScoreRepositoryPort.createMany not implemented");
  }

  async findByRunAndCandidate(_runId, _candidateHandle) {
    throw new Error("ScoreRepositoryPort.findByRunAndCandidate not implemented");
  }
}
