// Port (interface) — implemented by src/adapters/relational/KnexDocumentRepository.js.
// application/domain code depends on this shape, never on the concrete adapter.
export class DocumentRepositoryPort {
  async create(_document) {
    throw new Error("DocumentRepositoryPort.create not implemented");
  }

  async findById(_id) {
    throw new Error("DocumentRepositoryPort.findById not implemented");
  }

  // Insert-or-fully-replace by id — the ingestion use case identifies a
  // document by a caller-supplied stable id (e.g. the corpus manifest's own
  // id), not a freshly generated one, so re-ingesting the same source is an
  // update to the same row rather than a duplicate.
  async upsert(_document) {
    throw new Error("DocumentRepositoryPort.upsert not implemented");
  }

  // Idempotent re-ingestion (FR-1) hinges on this: same contentHash means
  // the source file hasn't changed since the last successful ingest.
  async findByContentHash(_contentHash) {
    throw new Error("DocumentRepositoryPort.findByContentHash not implemented");
  }

  async updateStatus(_id, _status, _statusMessage) {
    throw new Error("DocumentRepositoryPort.updateStatus not implemented");
  }

  async listAll() {
    throw new Error("DocumentRepositoryPort.listAll not implemented");
  }
}
