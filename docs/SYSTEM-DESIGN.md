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

_Additional rows added here as later phases (OCR confidence tuning, PDF-vs-DOCX scope, etc.) surface further deferrals worth recording._

### Every significant design decision, alternatives considered, and why rejected

_TODO: this section accumulates one entry per decision as it is made (mirrors, but expands on, the ADRs in `docs/ARCHITECTURE.md`). Candid entries — including expedient or under-time-pressure choices — are added here as they happen, not reconstructed afterward._
