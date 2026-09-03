// Port (interface) — implemented by src/adapters/vectorstore/PgVectorStore.js.
// Search methods return results shaped to match src/contracts/tools.js's
// ChunkResultSchema, so a retrieval use case can pass them straight through.
export class VectorStorePort {
  async insertChunks(_chunks) {
    throw new Error("VectorStorePort.insertChunks not implemented");
  }

  async deleteChunksByDocumentId(_documentId) {
    throw new Error("VectorStorePort.deleteChunksByDocumentId not implemented");
  }

  async searchByEmbedding(_embedding, _options) {
    throw new Error("VectorStorePort.searchByEmbedding not implemented");
  }

  async searchByKeyword(_query, _options) {
    throw new Error("VectorStorePort.searchByKeyword not implemented");
  }

  async findByCandidateId(_candidateId, _options) {
    throw new Error("VectorStorePort.findByCandidateId not implemented");
  }
}
