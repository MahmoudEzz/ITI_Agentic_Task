# ADR-0003: Vector store choice

## Status

Accepted — implemented in Phase 2, exercised continuously since through every phase's integration tests against real dockerized Postgres+pgvector (ingestion, retrieval, screening, report generation).

## Context

The corpus is ~37 documents / ~1,000-2,000 chunks — a small-to-medium scale by vector-search standards. The brief requires "a relational store + a vector store with migrations" and a `docker compose up` story that brings up the whole system including databases. No paid tier may be required.

## Decision

**pgvector**, running in the same PostgreSQL instance as the relational data (`pgvector/pgvector:pg16` image), using an HNSW index for approximate nearest-neighbor search.

## Alternatives considered

- **Qdrant** — a strong dedicated vector database, but adds a second stateful service to the compose stack for payload-filtering and scale capabilities this corpus does not need; the metadata filtering this build requires (by `candidateId`/`section`) is a normal indexed Postgres column, not a payload-filter feature that justifies a separate engine. Noted in `docs/SYSTEM-DESIGN.md` Part A as the scale-up path once corpus/query volume grows.
- **sqlite-vec** — genuinely zero-infrastructure, but weak under concurrent writes and awkward to present as "the whole system incl. databases" the brief asks `docker compose up` to demonstrate; also complicates the relational-store requirement, which would then need a second engine anyway.
- **A managed vector DB (Pinecone, etc.)** — rejected outright: the brief requires no paid subscriptions, and a managed service reintroduces exactly the "why you never need to pay for anything" risk the provider-abstraction requirement is designed to avoid.

## Consequences

- A chunk row and its embedding live in the same transaction, in the same database — inserting a chunk without its embedding (or vice versa) is a constraint violation, not a possible-but-rare race condition across two systems.
- This is explicitly a scale-limited choice: HNSW-in-pgvector on a single Postgres instance will not scale indefinitely, and `docs/SYSTEM-DESIGN.md`'s gap table states the managed-vector-DB migration path and its estimated effort rather than presenting pgvector as a permanent architectural decision.
- The `VectorStorePort` interface is still respected — swapping to Qdrant later is a new adapter behind the same port, not a change to `application`/`domain`.
