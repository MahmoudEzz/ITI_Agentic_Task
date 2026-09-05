import { ShortlistRepositoryPort } from "../../application/ports/ShortlistRepositoryPort.js";

function rowToShortlist(row) {
  if (!row) return null;
  return {
    id: row.id,
    runId: row.run_id,
    roleId: row.role_id,
    entries: row.entries,
    degraded: row.degraded,
    createdAt: row.created_at,
  };
}

export class KnexShortlistRepository extends ShortlistRepositoryPort {
  #knex;

  constructor(knex) {
    super();
    this.#knex = knex;
  }

  async create(shortlist) {
    const [row] = await this.#knex("shortlists")
      .insert({
        id: shortlist.id,
        run_id: shortlist.runId,
        role_id: shortlist.roleId,
        entries: JSON.stringify(shortlist.entries),
        degraded: shortlist.degraded ?? false,
      })
      .returning("*");
    return rowToShortlist(row);
  }

  async findByRunId(runId) {
    const row = await this.#knex("shortlists").where({ run_id: runId }).first();
    return rowToShortlist(row);
  }
}
