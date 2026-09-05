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

  // Fused dense+keyword retrieval (ADR-0001, Reciprocal Rank Fusion). Each
  // result's `score` is the fused rank score — not a confidence magnitude,
  // never threshold on it. `denseSimilarity` (raw cosine, 0-1, null for a
  // keyword-only hit) is the field a refusal decision should use instead.
  async hybridSearch(_queryText, _embedding, _options) {
    throw new Error("VectorStorePort.hybridSearch not implemented");
  }

  async findByCandidateId(_candidateId, _options) {
    throw new Error("VectorStorePort.findByCandidateId not implemented");
  }

  // Returns the chunkerVersion stamped on this document's existing chunks
  // (null if none exist yet). The ingestion use case compares this against
  // the current CHUNKER_VERSION to decide whether an otherwise-unchanged
  // document still needs re-chunking because the chunking strategy itself
  // changed — see Chunk.js and ADR-0001.
  async getChunkerVersionForDocument(_documentId) {
    throw new Error("VectorStorePort.getChunkerVersionForDocument not implemented");
  }
}
