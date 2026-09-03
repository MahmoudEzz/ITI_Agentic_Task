// Port (interface) — implemented by src/adapters/relational/KnexDocumentRepository.js.
// application/domain code depends on this shape, never on the concrete adapter.
export class DocumentRepositoryPort {
  async create(_document) {
    throw new Error("DocumentRepositoryPort.create not implemented");
  }

  async findById(_id) {
    throw new Error("DocumentRepositoryPort.findById not implemented");
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
