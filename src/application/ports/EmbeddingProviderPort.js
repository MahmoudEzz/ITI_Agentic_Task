// Port (interface) — implemented by src/adapters/llm/OllamaEmbeddingProvider.js
// (and, per ADR-0005, a Gemini implementation as the required second working
// provider — not yet built; tracked separately from this Phase 2 slice).
export class EmbeddingProviderPort {
  // texts: string[] -> Promise<number[][]>, one embedding vector per input,
  // same order. Batches internally where the underlying API supports it.
  async embed(_texts) {
    throw new Error("EmbeddingProviderPort.embed not implemented");
  }
}
