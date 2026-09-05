# ADR-0005: Provider abstraction and structured-output strategy

## Status

Proposed (implemented in Phase 4; flip to Accepted once landed and tested)

## Context

The brief mandates a single provider interface (completion, streaming, tool calling, embeddings) with ≥2 genuinely working implementations, selected by configuration, with a documented fallback chain — "this is also why you never need to pay for anything: design for a free tier running out." FR-4 additionally requires agents to communicate through typed contracts, not free-form text, which is the single highest-risk part of this build on a small local model without native structured-output guarantees.

## Decision

**Amendment (Phase 3, landed ahead of the original Phase 4 plan):** Phase 3's Q&A use case needed a working text-generation call before Phase 4 existed, so `LLMProviderPort` was built now with `complete` only — `stream` (SSE) and `toolCall` (agents) are added when Phase 7 and Phase 4 actually need them, since a port method every adapter would just throw `not implemented` on on day one is worse than an absent method. `embed` was already its own `EmbeddingProviderPort` since Phase 2, not folded into this one as originally sketched below — text generation and embeddings are genuinely separate capabilities with separate adapters (`OllamaEmbeddingProvider` vs. `OllamaProvider`), and splitting them means a change to one never forces a stub change on the other. The fallback chain (below) is real, implemented as `FallbackLLMProvider`, config-driven from `LLM_PROVIDER_CHAIN`.

One `LLMProviderPort` interface — eventually `complete`, `stream`, `toolCall` (`embed` lives on its own port, see amendment above) — with three implementations:

- **OllamaProvider** (primary, local) — `complete` built in Phase 3 via `ollama.chat()`; generation via `llama3.2:3b`, schema-constrained decoding (`format: <json-schema>`) lands with Phase 4's structured agent outputs (`complete`'s `schema` param already threads through to `format`, unused until then).
- **GeminiProvider** (secondary, hosted, genuinely free tier) — same interface, via `@google/genai`'s `generateContent`, mapping `schema` to `responseSchema`/`responseMimeType`.
- **MockProvider** — not yet built; Phase 3's `FallbackLLMProvider` unit test uses inline stub objects instead, since a formal `MockProvider` class only earns its keep once Phase 4's agents need canned *structured* (schema-shaped) responses, not just canned text.

Fallback chain: primary (Ollama) → secondary (Gemini) on failure → refuse (never silently substitute a mock in a live run). Built as `FallbackLLMProvider`, wired from `LLM_PROVIDER_CHAIN` in `src/infra/config/container.js`. Explicit timeout/backoff controls (the "or timeout" half of this line) are Phase 4 orchestration scope (`docs/SYSTEM-DESIGN.md`'s orchestrator "Controls" section), not built here — a slow provider in Phase 3 just responds slowly, it does not yet trigger fallback.

The schema passed to `complete({ schema })` is generated once, from the same Zod contract in `src/contracts`, via `zod-to-json-schema` — both providers validate against output shaped by the identical source of truth, so "typed contracts" means one schema per contract, not two hand-maintained copies. Retry-on-validation-failure (max 2 attempts) is a last-resort safety net, not the primary mechanism for getting well-formed output.

## Alternatives considered

- **Prompt-engineered JSON with a validation retry loop as the primary mechanism** — this is the common but fragile approach; on a small 3B local model, prompted-JSON compliance is unreliable enough that treating the retry loop as primary (rather than schema-constrained decoding as primary, retry as backstop) would make the multi-agent pipeline's reliability the weakest part of the whole submission. Rejected as primary; kept only as backstop.
- **A single hosted provider plus a mock as the "second implementation"** — technically satisfies "≥2 implementations" on a narrow reading, but a mock is not a working implementation in any meaningful sense; rejected because it would not survive scrutiny of the "swap provider = config + one adapter" acceptance test with a real second provider.
- **LangChain/LlamaIndex provider abstractions** — rejected in favor of a small hand-written interface, so every part of the fallback chain and schema-mapping logic is code the candidate wrote and can defend/teach line-by-line, per the instructor-role framing of this assessment.

## Consequences

- The Ollama path runs CPU-only inside Docker by default (no Metal passthrough on macOS); `OLLAMA_HOST=host.docker.internal` is documented as a faster dev-mode override, and the quality/speed delta between the two is disclosed candidly in `docs/SYSTEM-DESIGN.md`'s gap table rather than only measured against the faster path.
- A pre-embedded seed fixture is committed so the README's 5-Minute Demo Path does not require live-embedding the full corpus on CPU; `npm run ingest` from raw corpus remains the real, tested path exercised in CI.
- Because both providers validate against the same generated JSON Schema, adding a third provider later is genuinely a config change plus one adapter, not a new schema-mapping effort — this is the concrete evidence for the architecture's central acceptance test.
