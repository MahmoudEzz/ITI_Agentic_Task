import { CandidateRepositoryPort } from "../../application/ports/CandidateRepositoryPort.js";

function rowToCandidate(row) {
  if (!row) return null;
  return {
    id: row.id,
    handle: row.handle,
    fullName: row.full_name,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export class KnexCandidateRepository extends CandidateRepositoryPort {
  #knex;

  constructor(knex) {
    super();
    this.#knex = knex;
  }

  async create(candidate) {
    const [row] = await this.#knex("candidates")
      .insert({
        id: candidate.id,
        handle: candidate.handle,
        full_name: candidate.fullName,
        created_by: candidate.createdBy,
      })
      .returning("*");
    return rowToCandidate(row);
  }

  async findByHandle(handle) {
    const row = await this.#knex("candidates").where({ handle }).first();
    return rowToCandidate(row);
  }

  async findById(id) {
    const row = await this.#knex("candidates").where({ id }).first();
    return rowToCandidate(row);
  }
}
