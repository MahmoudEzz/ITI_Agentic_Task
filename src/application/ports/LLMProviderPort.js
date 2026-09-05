// Port (interface) — implemented by src/adapters/llm/{OllamaProvider,GeminiProvider,FallbackLLMProvider}.js.
// Per ADR-0005 the eventual interface is complete/stream/toolCall/embed;
// `toolCall` is folded into the orchestrator's own tool-dispatch mechanism
// (dispatchTool.js) rather than the provider — see ADR-0002/ADR-0005, no
// provider-level tool-calling loop is used. `embed` stays its own
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

  // request: { system?, prompt } -> AsyncGenerator yielding
  // { type: "delta", text } for each incremental chunk, then exactly one
  // { type: "done", tokensIn, tokensOut } as the final yielded value —
  // never a schema-constrained call (SSE prose streaming is for the
  // Shortlist Drafter's narrative/probes, ADR-0007; schema-constrained
  // steps stream discrete progress events instead, never raw JSON deltas).
  stream(_request) {
    throw new Error("LLMProviderPort.stream not implemented");
  }
}
