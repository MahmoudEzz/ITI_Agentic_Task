// Wraps an async unit of work with a trace_events row (FR-9) — start/end
// timestamps always recorded, even on failure (attributes.error is set
// rather than the span silently vanishing, since a failed step is exactly
// the kind of thing an operator inspecting a run's trace needs to see).
//
// `traceContext` is `{ correlationId, runId, onEvent }`, threaded down from
// wherever a request/run began (see runScreeningWorkflow.js/answerQuestion.js).
// `onEvent`, when given, fires `{ type: "<span>.started" | "<span>.completed"
// | "<span>.failed", span, attributes, error? }` around the same boundary —
// this is what lets an SSE route (Phase 7 PR3) emit live discrete progress
// events using the exact same instrumentation point as persistence, instead
// of a second parallel mechanism. It fires independently of persistence
// (a caller can want live events without a traceEventRepository, or vice
// versa) — the two concerns are orthogonal.
//
// Deliberately optional and null-safe throughout: a direct unit-test call
// to an agent with no traceContext still works, it just doesn't trace or
// emit anything. Tracing is an observability aid, not a security control,
// so it fails open, unlike auth.
export async function recordSpan(traceEventRepository, { correlationId, runId = null, span, parentSpan = null, attributes = {}, onEvent } = {}, fn) {
  const effectiveCorrelationId = correlationId ?? crypto.randomUUID();
  const startedAt = new Date();

  onEvent?.({ type: `${span}.started`, span, attributes });

  let result;
  try {
    result = await fn();
  } catch (error) {
    onEvent?.({ type: `${span}.failed`, span, attributes, error: error.message });
    if (traceEventRepository) {
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
    }
    throw error;
  }

  onEvent?.({ type: `${span}.completed`, span, attributes });
  if (traceEventRepository) {
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
  }
  return result;
}
