// Port (interface) — implemented by src/adapters/llm/{OllamaProvider,GeminiProvider,FallbackLLMProvider}.js.
// Per ADR-0005 the eventual interface is complete/stream/toolCall/embed, but
// only `complete` is built now (Phase 3 Q&A needs it); `stream` lands with
// Phase 7 (SSE), `toolCall` with Phase 4 (agents) — a method every adapter
// would just throw on is worse than an absent one. `embed` stays its own
// EmbeddingProviderPort, unchanged from Phase 2: text generation and
// embeddings are genuinely separate capabilities and keeping them on
// separate ports means a change to one never forces a stub on the other.
export class LLMProviderPort {
  // request: { system?, prompt, schema? } -> Promise<{ text }>.
  // schema, when given, is a JSON Schema object requesting constrained
  // decoding from the provider — callers validate the returned text
  // against their own Zod contract; this port does not parse or validate.
  async complete(_request) {
    throw new Error("LLMProviderPort.complete not implemented");
  }
}
