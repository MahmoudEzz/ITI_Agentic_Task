import { TraceEventRepositoryPort } from "../../application/ports/TraceEventRepositoryPort.js";

function rowToEvent(row) {
  return {
    id: row.id,
    correlationId: row.correlation_id,
    runId: row.run_id,
    span: row.span,
    parentSpan: row.parent_span,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    attributes: row.attributes,
    tokensIn: row.tokens_in,
    tokensOut: row.tokens_out,
    costUsd: row.cost_usd === null ? null : Number(row.cost_usd),
  };
}

export class KnexTraceEventRepository extends TraceEventRepositoryPort {
  #knex;

  constructor(knex) {
    super();
    this.#knex = knex;
  }

  async create(event) {
    await this.#knex("trace_events").insert({
      id: event.id,
      correlation_id: event.correlationId,
      run_id: event.runId ?? null,
      span: event.span,
      parent_span: event.parentSpan ?? null,
      started_at: event.startedAt,
      ended_at: event.endedAt ?? null,
      attributes: JSON.stringify(event.attributes ?? {}),
      tokens_in: event.tokensIn ?? null,
      tokens_out: event.tokensOut ?? null,
      cost_usd: event.costUsd ?? null,
    });
  }

  async findByRunId(runId) {
    const rows = await this.#knex("trace_events").where({ run_id: runId }).orderBy("started_at", "asc");
    return rows.map(rowToEvent);
  }
}
