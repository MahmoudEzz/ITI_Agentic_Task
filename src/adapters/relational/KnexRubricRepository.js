import { RubricRepositoryPort } from "../../application/ports/RubricRepositoryPort.js";

function rowToRubric(row) {
  if (!row) return null;
  return {
    id: row.id,
    roleId: row.role_id,
    competencyWeights: row.competency_weights,
    createdBy: row.created_by,
  };
}

export class KnexRubricRepository extends RubricRepositoryPort {
  #knex;

  constructor(knex) {
    super();
    this.#knex = knex;
  }

  async create(rubric) {
    const [row] = await this.#knex("rubrics")
      .insert({
        id: rubric.id,
        role_id: rubric.roleId,
        competency_weights: JSON.stringify(rubric.competencyWeights),
        created_by: rubric.createdBy,
      })
      .returning("*");
    return rowToRubric(row);
  }

  async findById(id) {
    const row = await this.#knex("rubrics").where({ id }).first();
    return rowToRubric(row);
  }

  async findByRoleId(roleId) {
    const row = await this.#knex("rubrics").where({ role_id: roleId }).first();
    return rowToRubric(row);
  }
}
