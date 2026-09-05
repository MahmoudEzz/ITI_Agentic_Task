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

    // Can't reuse recordSpan directly — that wraps a single Promise, and a
    // stream must forward each delta to the caller as it arrives (that's
    // the entire point of SSE), not buffer until the whole thing finishes.
    // Same fields end up in the same trace_events row either way; this is
    // just the generator-shaped version of the same bookkeeping.
    async *stream(request, traceContext = {}) {
      if (!traceEventRepository) {
        yield* llmProvider.stream(request);
        return;
      }

      const startedAt = new Date();
      const correlationId = traceContext.correlationId ?? crypto.randomUUID();
      const span = traceContext.span ?? "llm.stream";
      let tokensIn = null;
      let tokensOut = null;

      try {
        for await (const event of llmProvider.stream(request)) {
          if (event.type === "done") {
            tokensIn = event.tokensIn;
            tokensOut = event.tokensOut;
          }
          yield event;
        }
        await traceEventRepository.create({
          id: crypto.randomUUID(),
          correlationId,
          runId: traceContext.runId ?? null,
          span,
          parentSpan: traceContext.parentSpan ?? null,
          startedAt,
          endedAt: new Date(),
          attributes: traceContext.attributes ?? {},
          tokensIn,
          tokensOut,
          costUsd: 0,
        });
      } catch (error) {
        await traceEventRepository.create({
          id: crypto.randomUUID(),
          correlationId,
          runId: traceContext.runId ?? null,
          span,
          parentSpan: traceContext.parentSpan ?? null,
          startedAt,
          endedAt: new Date(),
          attributes: { ...(traceContext.attributes ?? {}), error: error.message },
          tokensIn: null,
          tokensOut: null,
          costUsd: null,
        });
        throw error;
      }
    },
  };
}
