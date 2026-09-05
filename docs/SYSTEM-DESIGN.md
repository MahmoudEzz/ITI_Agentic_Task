# System Design Document — Domain Copilot (D6 + T6)

> Status: living document. Part A is written now (it does not depend on implementation progress). Part B and the gap table are filled in as each component actually lands, phase by phase — never asserted ahead of the code that backs them.

## Part A — Target architecture, unconstrained

A production deployment serving multiple HR teams at real load would add, layer by layer:

- **Gateway & managed rate limiting** — an API gateway (e.g. Kong, AWS API Gateway) in front of Fastify, handling TLS termination, request-level rate limiting and quota enforcement per tenant/API key, instead of the in-process `@fastify/rate-limit` used in the MVP.
- **Secrets manager** — AWS Secrets Manager / HashiCorp Vault for the Gemini API key, JWT signing secret, and DB credentials, instead of `.env`.
- **Broker for async work** — a real message queue (e.g. SQS, RabbitMQ, or BullMQ-over-Redis) fronting long-running ingestion/OCR/screening jobs, with workers that scale independently of the API tier. (Note: T7 — async long-running jobs — is not the assigned twist; the MVP runs these synchronously within a request/SSE stream.)
- **Autoscaling** — the API and worker tiers behind an autoscaling group / Kubernetes HPA, scaling on queue depth and CPU.
- **Caching** — a Redis layer for hot retrieval results and rendered document fragments, reducing repeat embedding/LLM calls for identical queries.
- **Managed vector database** — a managed service (e.g. Pinecone, managed Qdrant, or a managed pgvector offering) replacing self-hosted pgvector once corpus size or concurrent query load outgrows a single Postgres instance.
- **Observability stack** — OpenTelemetry instrumentation exported to a hosted backend (e.g. Honeycomb, Datadog, or self-hosted Jaeger/Grafana Tempo), replacing the custom `trace_events` table.
- **CI/CD environments** — separate dev/staging/prod environments with promotion gates, instead of a single `main`-branch CI pipeline.
- **DR/backup** — automated Postgres backups (point-in-time recovery), cross-region replication for the vector store, and a documented RTO/RPO.
- **Cost model at scale** — per-tenant token budgets enforced at the gateway, reserved-capacity or batched-inference pricing for the LLM provider once volume justifies it, and a cost dashboard aggregating token spend, storage, and compute.

## Part B — Implemented MVP

_TODO: written and expanded phase by phase as each component is actually built — not before. The gap table below is the authoritative record of what was deferred and why._

### Phased build plan

Realistic estimate is ~50-55h against the brief's 40h target, stated candidly rather than force-fit — the brief's own guidance is to scope intelligently and document cuts, not to under-report effort. Docs are living documents updated in the same PR as each decision they describe. Teaching topic: **"OWASP LLM in Practice"** (the injected-CV corpus and bias-audit trail are distinctive evidence for this topic). Each phase lands as 2-3 small, atomic PRs with a linked Issue.

| Phase | Scope | Status |
|---|---|---|
| 0 | Repo & process scaffolding — folder structure, doc skeletons, ADRs, CI skeleton, tooling, Docker skeleton | Done |
| 1 | Domain & contracts foundation — entities, domain errors, Zod contracts, unit tests for pure domain logic | Done |
| 2 | Ingestion (FR-1), corpus authoring in parallel — extract→clean→chunk→embed→index against real Postgres+pgvector, idempotent re-ingestion | Done |
| 3 | Retrieval + Q&A + citations + refusal (FR-2) — **first demoable slice** | Done |
| 4 | Multi-agent workflow + approval gate + orchestration controls (FR-4/FR-5) — **second demoable slice** | Pending |
| 5 | T6 document in/out — OCR with confidence flagging, DOCX + PDF generation | Pending |
| 6 | Security hardening + bias audit trail | Pending |
| 7 | Web UI + streaming + observability polish (FR-6/FR-7/FR-9) | Pending |
| 8 | Evaluation harness with real numbers (FR-3) | Pending |
| 9 | Docs finalization, teaching pack, videos, submission checklist | Pending |

**Cut order if behind schedule** (per the brief's own priority): web UI → CLI/curl fallback (Phase 7). Agent count is a floor — cannot cut below 3+orchestrator. Optional retrieval enhancement → drop metadata filtering, hybrid-only (Phase 3). Corpus size → shrink toward the 30-doc/150-page floor (Phase 2). Twist breadth → keep OCR + DOCX core, drop the PDF twin if time-constrained (Phase 5). **Never cut:** Phase 8 (eval), Phase 6 (security), Phase 9 (docs/teaching/videos).

### Gap table

| Target component (Part A) | Implemented? | Why deferred | Interim mitigation | Effort & cost to close |
|---|---|---|---|---|
| API gateway / managed rate limiting | No | Out of scope for a single-instance 40h build | In-process `@fastify/rate-limit` per IP/user | ~4h + a gateway service's monthly cost (e.g. ~$0-20/mo on a managed tier) |
| Secrets manager | No | No paid infra required by the brief | `.env` (gitignored, `.env.example` complete, no real secrets committed) | ~2h + ~$0-5/mo for a basic Vault/Secrets Manager tier |
| Message broker / async workers | No | T7 not the assigned twist; workflow is short enough to run synchronously within the SSE-streamed request | Synchronous pipeline execution per run, with per-step timeouts and retries | ~8h to introduce BullMQ + a worker process |
| Autoscaling | No | Single-instance Docker Compose deployment | N/A — documented as a known scaling limit | ~6h for a Kubernetes/ECS manifest + HPA config |
| Caching (Redis) | No | Corpus/query volume in the MVP does not justify it | None — acceptable duplicate LLM calls at this scale | ~3h |
| Managed vector DB | No, uses self-hosted pgvector | Zero-cost, transactionally consistent with relational data at this corpus size (see ADR on vector store choice) | pgvector HNSW index, monitored for query latency | ~1 day migration effort if corpus/query volume outgrows it |
| OTel / hosted observability | No, uses a custom `trace_events` table | Fits the time budget; a clean custom trace store is explicitly accepted as equivalent by the brief | `GET /runs/:id/trace` endpoint over the custom table | ~4h to add OTel SDK instrumentation on top of the same spans |
| DR/backup | No | Out of scope for an assessment deployment | Documented as a known gap; Postgres data is reproducible from `npm run ingest` against the committed corpus | ~2h for scheduled `pg_dump` + off-box storage |
| Full multi-tenant isolation (T0) | No, ownership-scoping only | T0 is not the assigned twist | Per-user `createdBy` scoping enforced server-side on every resource | ~1-2 days for full tenant-schema isolation + the cross-tenant-leakage test T0 requires |
| Corpus page-count floor (150+ pages) | Partial — 42 documents (well past the 30-doc floor), 69 pages | Every document is realistic, purpose-built content (a real job description, a real 3-entry CV, a real 12-page policy) rather than padding; hitting 150 pages by inflating individual documents would make chunking/retrieval fixtures less representative of a real corpus, not more | Corpus is diverse across all required fixture types (bias, injection — including the indirect-via-policy-document case, OCR, conflicting sources) despite the shorter total length, so FR-2/FR-3 evaluation is not blocked by this gap | ~2-3h to add 3-4 more policy/reference documents at similar length and depth to the existing ones, closing most of the remaining ~80 pages |

| Local Ollama reliability under sustained multi-candidate batch load | No — observed a real model-runner crash mid-batch (Phase 4, `runScreeningWorkflow.js` verification against 9 candidates); self-recovered on the next request | A CPU-bound 3B model in Docker handling a long sequence of large-context completions back-to-back is inherently more fragile than a hosted API under the same load; not something a config change fixes | `FallbackLLMProvider` already falls through to Gemini on exactly this failure (verified for real, not just stubbed) — the gap is Gemini itself needing a real `GEMINI_API_KEY` to actually complete the fallback, not just fail more informatively | ~0h once a real Gemini key is configured; a batch-level retry/backoff around whole-candidate failures (distinct from `runStructuredCompletion`'s per-call retry) would be additional Phase 6 hardening |

_Additional rows added here as later phases (OCR confidence tuning, PDF-vs-DOCX scope, etc.) surface further deferrals worth recording._

### Every significant design decision, alternatives considered, and why rejected

_This section accumulates one entry per decision as it is made (mirrors, but expands on, the ADRs in `docs/ARCHITECTURE.md`). Candid entries — including expedient or under-time-pressure choices — are added here as they happen, not reconstructed afterward._

**Isolated test database (Phase 4, closes issue #35).** Integration tests truncate `chunks`/`documents`/`candidates` between cases; until this phase they ran against whatever `DATABASE_URL` resolved to, which for local dev is the same database `npm run ingest` populates — invisible in CI, whose Postgres service container is already ephemeral per run, but a real footgun locally. Fixed with `TEST_DATABASE_URL`, consulted only when `NODE_ENV=test` (set by the `test:integration`/`test:all` npm scripts) — CI sets neither `NODE_ENV` nor this var, so it falls through to `DATABASE_URL` unchanged. `docker/init-test-db.sh` creates the second database automatically on a fresh `docker compose up`; an already-initialized volume needs the one-time manual `CREATE DATABASE` documented in `.env.example`.
