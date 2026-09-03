# tests

- `unit/` — domain and application logic, LLM calls stubbed via `MockProvider`.
- `integration/` — ingestion and retrieval against a real dockerized Postgres/pgvector.
- `contract/` — every agent/tool I/O validated against its `src/contracts/` Zod schema.

Ten sharp tests beat a hundred trivial ones — each test here should be able to fail for a real reason.
