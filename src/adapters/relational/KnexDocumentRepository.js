import { DocumentRepositoryPort } from "../../application/ports/DocumentRepositoryPort.js";

// Row shape carries operational metadata (contentHash, status, sourcePath)
// that the pure Document.js domain entity deliberately doesn't — those are
// ingestion-pipeline concerns, not core business identity. This adapter is
// the boundary where that distinction is made concrete.
function rowToDocument(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    sourceFormat: row.source_format,
    version: row.version,
    createdBy: row.created_by,
    candidateId: row.candidate_id,
    sourcePath: row.source_path,
    contentHash: row.content_hash,
    status: row.status,
    statusMessage: row.status_message,
    ocrRequired: row.ocr_required,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KnexDocumentRepository extends DocumentRepositoryPort {
  #knex;

  constructor(knex) {
    super();
    this.#knex = knex;
  }

  async create(document) {
    const [row] = await this.#knex("documents")
      .insert({
        id: document.id,
        type: document.type,
        title: document.title,
        source_format: document.sourceFormat,
        version: document.version ?? 1,
        created_by: document.createdBy,
        candidate_id: document.candidateId ?? null,
        source_path: document.sourcePath,
        content_hash: document.contentHash,
        status: document.status ?? "pending",
        ocr_required: document.ocrRequired ?? false,
      })
      .returning("*");
    return rowToDocument(row);
  }

  async findById(id) {
    const row = await this.#knex("documents").where({ id }).first();
    return rowToDocument(row);
  }

  async findByContentHash(contentHash) {
    const row = await this.#knex("documents").where({ content_hash: contentHash }).first();
    return rowToDocument(row);
  }

  async updateStatus(id, status, statusMessage = null) {
    const [row] = await this.#knex("documents")
      .where({ id })
      .update({ status, status_message: statusMessage, updated_at: this.#knex.fn.now() })
      .returning("*");
    return rowToDocument(row);
  }

  async listAll() {
    const rows = await this.#knex("documents").select("*").orderBy("created_at", "asc");
    return rows.map(rowToDocument);
  }
}
