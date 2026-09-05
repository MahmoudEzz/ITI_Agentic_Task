import { CompetencyRepositoryPort } from "../../application/ports/CompetencyRepositoryPort.js";

function rowToCompetency(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    behavioralAnchors: row.behavioral_anchors,
    scaleMin: row.scale_min,
    scaleMax: row.scale_max,
  };
}

export class KnexCompetencyRepository extends CompetencyRepositoryPort {
  #knex;

  constructor(knex) {
    super();
    this.#knex = knex;
  }

  async create(competency) {
    const [row] = await this.#knex("competencies")
      .insert({
        id: competency.id,
        name: competency.name,
        description: competency.description,
        behavioral_anchors: JSON.stringify(competency.behavioralAnchors),
        scale_min: competency.scaleMin,
        scale_max: competency.scaleMax,
      })
      .returning("*");
    return rowToCompetency(row);
  }

  async findById(id) {
    const row = await this.#knex("competencies").where({ id }).first();
    return rowToCompetency(row);
  }

  async listAll() {
    const rows = await this.#knex("competencies").select("*");
    return rows.map(rowToCompetency);
  }
}
