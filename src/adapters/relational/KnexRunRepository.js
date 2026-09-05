import { RunRepositoryPort } from "../../application/ports/RunRepositoryPort.js";

function rowToRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    workflowType: row.workflow_type,
    state: row.state,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToStep(row) {
  return { id: row.id, runId: row.run_id, state: row.state, note: row.note, enteredAt: row.entered_at };
}

export class KnexRunRepository extends RunRepositoryPort {
  #knex;

  constructor(knex) {
    super();
    this.#knex = knex;
  }

  async create(run) {
    await this.#knex.transaction(async (trx) => {
      await trx("runs").insert({
        id: run.id,
        workflow_type: run.workflowType,
        state: run.state,
        created_by: run.createdBy,
      });
      await trx("run_steps").insert({ id: crypto.randomUUID(), run_id: run.id, state: run.state });
    });
    return this.findById(run.id);
  }

  async findById(id) {
    const row = await this.#knex("runs").where({ id }).first();
    return rowToRun(row);
  }

  async transitionTo(runId, state, { note = null } = {}) {
    await this.#knex.transaction(async (trx) => {
      await trx("runs").where({ id: runId }).update({ state, updated_at: trx.fn.now() });
      await trx("run_steps").insert({ id: crypto.randomUUID(), run_id: runId, state, note });
    });
    return this.findById(runId);
  }

  async listSteps(runId) {
    const rows = await this.#knex("run_steps").where({ run_id: runId }).orderBy("entered_at", "asc");
    return rows.map(rowToStep);
  }
}
