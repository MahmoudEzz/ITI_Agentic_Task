import { ReportAssetRepositoryPort } from "../../application/ports/ReportAssetRepositoryPort.js";

function rowToAsset(row) {
  if (!row) return null;
  return {
    id: row.id,
    runId: row.run_id,
    approvalId: row.approval_id,
    format: row.format,
    content: row.content,
    generatedAt: row.generated_at,
  };
}

export class KnexReportAssetRepository extends ReportAssetRepositoryPort {
  #knex;

  constructor(knex) {
    super();
    this.#knex = knex;
  }

  async create(asset) {
    const [row] = await this.#knex("report_assets")
      .insert({
        id: asset.id,
        run_id: asset.runId,
        approval_id: asset.approvalId,
        format: asset.format,
        content: asset.content,
        generated_at: asset.generatedAt,
      })
      .returning("*");
    return rowToAsset(row);
  }

  async findById(id) {
    const row = await this.#knex("report_assets").where({ id }).first();
    return rowToAsset(row);
  }
}
