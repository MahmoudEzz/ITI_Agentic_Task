// Port (interface) — implemented by src/adapters/relational/KnexShortlistRepository.js.
export class ShortlistRepositoryPort {
  async create(_shortlist) {
    throw new Error("ShortlistRepositoryPort.create not implemented");
  }

  async findByRunId(_runId) {
    throw new Error("ShortlistRepositoryPort.findByRunId not implemented");
  }

  // Records the approval-authorized final ranking onto the existing draft
  // row (see the finalization-columns migration) — never a second table,
  // since a run has at most one shortlist and at most one finalization.
  async finalize(_shortlistId, _options) {
    throw new Error("ShortlistRepositoryPort.finalize not implemented");
  }
}
