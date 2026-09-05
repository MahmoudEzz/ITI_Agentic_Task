// Port (interface) — implemented by src/adapters/relational/KnexShortlistRepository.js.
export class ShortlistRepositoryPort {
  async create(_shortlist) {
    throw new Error("ShortlistRepositoryPort.create not implemented");
  }

  async findByRunId(_runId) {
    throw new Error("ShortlistRepositoryPort.findByRunId not implemented");
  }
}
