# ADR-0007: Streaming strategy — SSE, and prose vs. discrete progress events

## Status

Accepted — `LLMProviderPort.stream()` and its Ollama/Gemini/FallbackLLMProvider implementations (Phase 7 PR2), and the SSE HTTP routes (`POST /ask`, `POST /runs`, Phase 7 PR3) have all landed and been live-verified against a really-running server: real streamed `/ask` deltas ending in a resolved-citation answer, and a real `/runs` call showing genuine per-attempt retry progress events and a real error path from a live grounding-check rejection. `AbortController` cancellation is disclosed as a real, deliberate gap (see Consequences), not assumed done.

## Context

FR-6 requires streaming for a responsive demo: prose token-by-token for the parts of the pipeline that generate free text (the Q&A answer, the Shortlist Drafter's narrative/interview probes), and visible progress for the schema-constrained steps (Evidence Extractor, Rubric Scorer) that don't produce anything meaningful to stream token-by-token — a Rubric Scorer emitting partial JSON mid-generation is not useful to a client and would require the client to parse invalid JSON fragments.

## Decision

**Server-Sent Events (SSE), not WebSockets.** Every stream this system produces is server-to-client only (tokens, progress) — nothing flows client-to-server mid-stream except an HTTP cancellation (a `DELETE`/abort of the underlying request, which SSE supports via the client closing the connection). WebSockets would add a second, more complex protocol and reconnection story for a bidirectional capability nothing here needs.

**Two distinct streaming shapes, not one:**
- **Prose streaming** — `LLMProviderPort.stream(request)` (Phase 7 PR2): an async generator yielding `{ type: "delta", text }` for each incremental chunk, then exactly one `{ type: "done", tokensIn, tokensOut }`. Used only for genuinely free-text generation (Q&A answers, the Shortlist Drafter's narrative) — never for a schema-constrained call, so a client is never asked to parse a partial JSON object.
- **Discrete progress events** — for `POST /runs` (screening), the client instead receives coarse, whole-event SSE messages (`agent.started`, `tool.called`, `agent.completed`, mirroring `trace_events`' own span vocabulary from Phase 7 PR1) as each pipeline step begins/ends, never raw model output for the JSON-producing steps. This is a route-level concern, not a `LLMProviderPort` one — it reads from the same `recordSpan` calls PR1 already wired in, rather than needing a second instrumentation mechanism.

**Fallback and cancellation implications**: `FallbackLLMProvider.stream()` only fails over to the next provider *before* the first delta has reached the caller — once a client has received live output from a provider, silently restarting from a different one would produce a second, overlapping stream rather than a clean handoff, so a failure past that point propagates to the client directly instead (see `FallbackLLMProvider.js`'s own comment). Full `AbortController` wiring through the HTTP handler and both provider fetches (so a client disconnecting mid-stream actually cancels the underlying Ollama/Gemini call, not just stops relaying it) is scoped to PR3 alongside the routes themselves — the plan's own cut order values the UI over cancellation specifically, so if PR3 runs short on time this is the piece disclosed as cut, not the UI.

## Alternatives considered

- **WebSockets** — rejected: no bidirectional capability is needed, and SSE's plain-HTTP, auto-reconnecting semantics are a strictly better fit with no cost paid.
- **Streaming raw partial JSON for the Evidence Extractor/Rubric Scorer too** — rejected: a small local model's structured output isn't guaranteed to be well-formed until the final token, and a client attempting to incrementally parse it would either need speculative JSON-repair logic or simply wait anyway — discrete progress events give the same perceived responsiveness (the client knows the step started/finished) without that complexity.
- **A single unified event type for both prose and progress** — rejected: prose deltas and progress events have different consumers (a text-rendering UI element vs. a step-indicator UI element) and different cardinality (many deltas per call vs. one event per pipeline step); collapsing them into one shape would just push the same discrimination logic into the client.

## Consequences

- Every prose-streaming caller must use `LLMProviderPort.stream()`, never `complete()`, when the response is meant to be shown incrementally — a route that calls `complete()` and then fakes streaming by chunking the final string is explicitly not this design (it defeats the actual latency benefit and would trace as a single instantaneous span instead of the real per-token timeline).
- `createTracingLLMProvider.stream()` (Phase 7 PR1) already records the same `trace_events` shape for a streamed call as for `complete()` — PR3's discrete-progress-event routes can read directly from that store rather than needing parallel bookkeeping.
- Cancellation is disclosed as a real gap until PR3 actually wires `AbortController` through — not assumed done because the port signature could theoretically support it.
