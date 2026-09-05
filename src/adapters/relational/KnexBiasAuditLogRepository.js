import { BiasAuditLogRepositoryPort } from "../../application/ports/BiasAuditLogRepositoryPort.js";

function rowToEntry(row) {
  return {
    sourceChunkId: row.source_chunk_id,
    category: row.category,
    action: row.action,
    start: row.span_start,
    end: row.span_end,
    at: row.at,
  };
}

export class KnexBiasAuditLogRepository extends BiasAuditLogRepositoryPort {
  #knex;

  constructor(knex) {
    super();
    this.#knex = knex;
  }

  async createMany(runId, auditEntries) {
    if (auditEntries.length === 0) return;
    await this.#knex("bias_audit_log").insert(
      auditEntries.map((entry) => ({
        id: crypto.randomUUID(),
        run_id: runId,
        source_chunk_id: entry.sourceChunkId,
        category: entry.category,
        action: entry.action,
        span_start: entry.start ?? null,
        span_end: entry.end ?? null,
        at: entry.at,
      })),
    );
  }

  async findByRunId(runId) {
    const rows = await this.#knex("bias_audit_log").where({ run_id: runId }).orderBy("at", "asc");
    return rows.map(rowToEntry);
  }
}
