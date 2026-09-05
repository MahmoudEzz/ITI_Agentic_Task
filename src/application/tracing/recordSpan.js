// Wraps an async unit of work with a trace_events row (FR-9) — start/end
// timestamps always recorded, even on failure (attributes.error is set
// rather than the span silently vanishing, since a failed step is exactly
// the kind of thing an operator inspecting a run's trace needs to see).
//
// `traceContext` is `{ correlationId, runId }`, threaded down from wherever
// a request/run began (see runScreeningWorkflow.js/answerQuestion.js) —
// deliberately optional and null-safe: a direct unit-test call to an agent
// with no traceContext still works, it just traces with a generated,
// otherwise-unused correlation id rather than crashing. Tracing is an
// observability aid, not a security control, so it fails open, unlike auth.
export async function recordSpan(traceEventRepository, { correlationId, runId = null, span, parentSpan = null, attributes = {} } = {}, fn) {
  // No repository wired (most unit tests construct a use case without one)
  // -> tracing is simply off, `fn` still runs normally. The same fail-open
  // discipline applies whether or not a real traceContext was supplied.
  if (!traceEventRepository) return fn();

  const effectiveCorrelationId = correlationId ?? crypto.randomUUID();
  const startedAt = new Date();

  try {
    const result = await fn();
    await traceEventRepository.create({
      id: crypto.randomUUID(),
      correlationId: effectiveCorrelationId,
      runId,
      span,
      parentSpan,
      startedAt,
      endedAt: new Date(),
      attributes,
      tokensIn: result?.tokensIn ?? null,
      tokensOut: result?.tokensOut ?? null,
      costUsd: result?.costUsd ?? null,
    });
    return result;
  } catch (error) {
    await traceEventRepository.create({
      id: crypto.randomUUID(),
      correlationId: effectiveCorrelationId,
      runId,
      span,
      parentSpan,
      startedAt,
      endedAt: new Date(),
      attributes: { ...attributes, error: error.message },
      tokensIn: null,
      tokensOut: null,
      costUsd: null,
    });
    throw error;
  }
}
