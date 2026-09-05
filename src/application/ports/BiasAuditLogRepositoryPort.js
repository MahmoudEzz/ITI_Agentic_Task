// Port (interface) — implemented by src/adapters/relational/KnexBiasAuditLogRepository.js.
// Persists exactly the auditEntries shape redactProtectedAttributes.js
// returns (see ADR-0006) — this port adds no fields of its own beyond runId.
export class BiasAuditLogRepositoryPort {
  async createMany(_runId, _auditEntries) {
    throw new Error("BiasAuditLogRepositoryPort.createMany not implemented");
  }

  async findByRunId(_runId) {
    throw new Error("BiasAuditLogRepositoryPort.findByRunId not implemented");
  }
}
