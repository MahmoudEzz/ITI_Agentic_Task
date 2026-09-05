import { recordSpan } from "./recordSpan.js";

// Wraps a real LLMProviderPort implementation so every completion is traced
// (FR-9's token/cost accounting) without any adapter needing to know about
// trace_events — the same decorator-over-a-port pattern FallbackLLMProvider
// already uses, applied for observability instead of failover. Registered
// once in container.js wrapping the fallback chain, so every caller gets
// tracing "for free" as long as it forwards traceContext through.
export function createTracingLLMProvider({ llmProvider, traceEventRepository }) {
  return {
    async complete(request, traceContext = {}) {
      return recordSpan(
        traceEventRepository,
        { ...traceContext, span: traceContext.span ?? "llm.complete" },
        async () => {
          const result = await llmProvider.complete(request);
          // Both configured providers (local Ollama, Gemini's free tier)
          // are genuinely free — 0 is a real measurement, not a stand-in
          // for an unpriced call. See docs/SECURITY.md.
          return { ...result, costUsd: 0 };
        },
      );
    },
  };
}
