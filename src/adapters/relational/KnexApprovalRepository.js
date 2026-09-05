import { ApprovalRepositoryPort } from "../../application/ports/ApprovalRepositoryPort.js";

function rowToApproval(row) {
  if (!row) return null;
  return {
    id: row.id,
    runId: row.run_id,
    decision: row.decision,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    editDiff: row.edit_diff,
    comment: row.comment,
  };
}

export class KnexApprovalRepository extends ApprovalRepositoryPort {
  #knex;

  constructor(knex) {
    super();
    this.#knex = knex;
  }

  async create(approval) {
    const [row] = await this.#knex("approvals")
      .insert({
        id: approval.id,
        run_id: approval.runId,
        decision: approval.decision,
        decided_by: approval.decidedBy,
        edit_diff: approval.editDiff ?? null,
        comment: approval.comment ?? null,
      })
      .returning("*");
    return rowToApproval(row);
  }

  async findByRunId(runId) {
    const row = await this.#knex("approvals").where({ run_id: runId }).orderBy("decided_at", "desc").first();
    return rowToApproval(row);
  }
}
