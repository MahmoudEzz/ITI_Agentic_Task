// Port (interface) — implemented by src/adapters/relational/KnexTraceEventRepository.js.
export class TraceEventRepositoryPort {
  async create(_event) {
    throw new Error("TraceEventRepositoryPort.create not implemented");
  }

  async findByRunId(_runId) {
    throw new Error("TraceEventRepositoryPort.findByRunId not implemented");
  }
}
