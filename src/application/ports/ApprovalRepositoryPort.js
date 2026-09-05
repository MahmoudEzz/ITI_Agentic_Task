// Port (interface) — implemented by src/adapters/relational/KnexApprovalRepository.js.
export class ApprovalRepositoryPort {
  async create(_approval) {
    throw new Error("ApprovalRepositoryPort.create not implemented");
  }

  async findByRunId(_runId) {
    throw new Error("ApprovalRepositoryPort.findByRunId not implemented");
  }
}
