# ADR-0005: Provider abstraction and structured-output strategy

## Status

Proposed (implemented in Phase 4; flip to Accepted once landed and tested)

## Context

The brief mandates a single provider interface (completion, streaming, tool calling, embeddings) with ≥2 genuinely working implementations, selected by configuration, with a documented fallback chain — "this is also why you never need to pay for anything: design for a free tier running out." FR-4 additionally requires agents to communicate through typed contracts, not free-form text, which is the single highest-risk part of this build on a small local model without native structured-output guarantees.

## Decision

One `LLMProviderPort` interface — `complete`, `stream`, `toolCall`, `embed` — with three implementations:

- **OllamaProvider** (primary, local) — generation via `llama3.2:3b` or `qwen2.5:3b`, embeddings via `nomic-embed-text`, using Ollama's schema-constrained decoding (`format: <json-schema>`) for every structured agent output.
- **GeminiProvider** (secondary, hosted, genuinely free tier) — same interface, mapping the same schema to Gemini's structured-output/response-schema field.
- **MockProvider** — deterministic canned responses, used only in CI/unit tests, never in a live run.

Fallback chain: primary (Ollama) → secondary (Gemini) on failure/timeout → refuse or degrade (never silently substitute the mock in a live run).

The schema passed to `complete({ schema })` is generated once, from the same Zod contract in `src/contracts`, via `zod-to-json-schema` — both providers validate against output shaped by the identical source of truth, so "typed contracts" means one schema per contract, not two hand-maintained copies. Retry-on-validation-failure (max 2 attempts) is a last-resort safety net, not the primary mechanism for getting well-formed output.

## Alternatives considered

- **Prompt-engineered JSON with a validation retry loop as the primary mechanism** — this is the common but fragile approach; on a small 3B local model, prompted-JSON compliance is unreliable enough that treating the retry loop as primary (rather than schema-constrained decoding as primary, retry as backstop) would make the multi-agent pipeline's reliability the weakest part of the whole submission. Rejected as primary; kept only as backstop.
- **A single hosted provider plus a mock as the "second implementation"** — technically satisfies "≥2 implementations" on a narrow reading, but a mock is not a working implementation in any meaningful sense; rejected because it would not survive scrutiny of the "swap provider = config + one adapter" acceptance test with a real second provider.
- **LangChain/LlamaIndex provider abstractions** — rejected in favor of a small hand-written interface, so every part of the fallback chain and schema-mapping logic is code the candidate wrote and can defend/teach line-by-line, per the instructor-role framing of this assessment.

## Consequences

- The Ollama path runs CPU-only inside Docker by default (no Metal passthrough on macOS); `OLLAMA_HOST=host.docker.internal` is documented as a faster dev-mode override, and the quality/speed delta between the two is disclosed candidly in `docs/SYSTEM-DESIGN.md`'s gap table rather than only measured against the faster path.
- A pre-embedded seed fixture is committed so the README's 5-Minute Demo Path does not require live-embedding the full corpus on CPU; `npm run ingest` from raw corpus remains the real, tested path exercised in CI.
- Because both providers validate against the same generated JSON Schema, adding a third provider later is genuinely a config change plus one adapter, not a new schema-mapping effort — this is the concrete evidence for the architecture's central acceptance test.
