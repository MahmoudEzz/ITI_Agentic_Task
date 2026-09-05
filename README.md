# Domain Copilot — HR Talent Screening (D6 + T6)

An agentic RAG platform that screens candidates against a role's competency rubric — grounded, cited, bias-guarded, and gated behind human approval before anything reaches a hiring manager's desk.

**Built for:** ITI Technical Instructor (Post-Graduate Training) technical assessment.

> **Status: Phases 0-7 done** (scaffolding, domain/contracts, ingestion, retrieval/Q&A, multi-agent screening + approval gate, T6 OCR + report generation, security hardening, web UI + streaming + observability — see `docs/SYSTEM-DESIGN.md`'s phase table). `npm run ask`/`npm run screen` still work exactly as before, end-to-end against the real corpus and a real local Ollama; a real Fastify HTTP API now also serves JWT auth, ownership-scoped run/trace access and approval decisions, SSE streaming for both `/ask` (token-by-token) and `/runs` (discrete progress events), and a minimal static web UI at `/app` covering all five planned screens (ask, ingest — CLI-only, disclosed — run workflow, approval, trace). Document upload over HTTP and request cancellation remain disclosed gaps (`docs/SECURITY.md`), not silent ones. Evaluation harness numbers (Phase 8) are still outstanding — not a finished demo yet. This README grows into the full "assume the reader has Docker and 15 minutes" quick-start as each remaining phase lands.

## Assigned variant

Derived from National ID `29307051603297` (no variant was supplied directly in an invitation email, so the brief's derivation rule was applied):

- **Domain** = last two digits of the ID (`97`) mod 7 = **6 → D6, HR — Talent Screening**
- **Twist** = sum of all digits of the ID (`54`) mod 8 = **6 → T6, Document In/Out**

**D6 workflow:** role + candidate pool → extract competency evidence → score against rubric → shortlist + interview probes, via three specialised agents (Evidence Extractor, Rubric Scorer, Shortlist Drafter) plus an orchestrator, with a hiring manager approving the final shortlist. Named risk guarded structurally: protected attributes are excluded from scoring by construction, with an audit trail.

**T6 requirement:** OCR of scanned candidate CVs with confidence handling, plus a generated DOCX and PDF shortlist report with citations and a scoring-matrix table.

## Architecture at a glance

Hexagonal (Ports & Adapters) — see `docs/ARCHITECTURE.md` for the full rationale, diagrams, and ADRs. Node.js/JavaScript, Fastify, PostgreSQL+pgvector, Ollama (local, primary) + Google Gemini (hosted free tier, secondary) behind one provider interface.

```
src/domain/        pure business logic — zero external dependencies
src/application/   use cases, orchestrator, agents, ports
src/adapters/      LLM providers, vector store, OCR, document generation, HTTP, web UI
src/infra/         config, DI composition root, DB migrations
src/contracts/     Zod schemas — agent/tool/API contracts
prompts/           versioned prompt artifacts
corpus/            synthetic seed documents
docs/              BRD, System Design, Architecture, Security, Evaluation, ADRs
teaching/          the teaching pack (slides, lab, assessment map)
```

## Quick start

A minimal HTTP API (`npm run dev`/`npm start`) exists as of Phase 6 — auth, one ownership-scoped run route, and one approval-decision route, security headers/CORS/rate-limiting; the rest of the business API and the web UI land with Phase 7. What's real and verified today — ingestion end-to-end against real Postgres+pgvector and the full 42-document corpus:

```bash
cp .env.example .env        # fill in GEMINI_API_KEY when you have one; not needed for the commands below
docker compose up -d postgres ollama
docker compose run --rm ollama-pull   # first run: ~2.6GB image + ~2.3GB of models, several minutes
docker compose exec ollama ollama list   # should show llama3.2:3b and nomic-embed-text

npm install
npm run migrate     # creates candidates/documents/chunks/competencies/rubrics/runs/... tables
npm run ingest       # extracts, chunks, embeds, and indexes the full corpus — idempotent re-runs skip unchanged docs
npm run seed         # hand-authored competencies/rubrics matching the corpus rubric documents — idempotent
```

A real HTTP API + minimal web UI exist as of Phase 7 (`npm run dev` / `npm start`, or via the `api` compose service):

```bash
npm run users -- create --email "recruiter1@example.com" --password "change-me" --role recruiter
npm run users -- create --email "hm1@example.com" --password "change-me" --role hiring_manager

npm run dev   # or: node src/adapters/http/server.js

open http://localhost:3000/app/   # the static UI — login, ask, run workflow, approval, trace

curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"email":"hm1@example.com","password":"change-me"}'   # -> { token, user }

curl -N -X POST http://localhost:3000/ask -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" -d '{"question":"..."}'   # SSE: streamed prose deltas, then a citations event

curl -N -X POST http://localhost:3000/runs -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"roleId":"backend-engineer","rubricId":"rubric-backend-engineer","candidateHandles":["CAND-001"]}'
  # SSE: discrete progress events as the pipeline runs, then a result event

curl http://localhost:3000/runs -H "Authorization: Bearer <token>"              # list (ownership-scoped)
curl http://localhost:3000/runs/<runId>/trace -H "Authorization: Bearer <token>" # per-run trace_events
curl -X POST http://localhost:3000/runs/<runId>/decision -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" -d '{"decision":"approved"}'
curl http://localhost:3000/readyz   # Postgres + Ollama reachability, no auth needed
```

Document upload (`/ingest` over HTTP) and request cancellation remain disclosed gaps (`docs/SECURITY.md`) — ingestion stays CLI-only (`npm run ingest`, below), same as before Phase 7.

A full screening run, human approval, and T6 report generation, against the real corpus:

```bash
npm run ask -- "What backend engineering experience does CAND-001 have?"   # grounded Q&A with citations

npm run screen -- run --role backend-engineer --rubric rubric-backend-engineer --by "recruiter@example.com"
# -> prints a run id and a drafted shortlist; some candidates may fail extraction/scoring
#    (a disclosed residual risk — see docs/SECURITY.md — or a genuinely OCR-blocked CV)

npm run screen -- decide --run <runId> --decision approved --by "hiring-manager@example.com"
npm run screen -- generate --run <runId> --format docx   # or pdf — writes to reports/generated/<runId>.<format>
```

```bash
npm test            # unit tests
npm run test:contract
npm run test:integration   # requires postgres running, see above, and a domain_copilot_test database — created automatically by docker/init-test-db.sh, or once by hand on an already-initialized volume (see .env.example)
npm run migrate:test       # applies migrations to that test database (once, or after adding a new migration)
npm run lint
```

## Environment variables

_TODO: table of every variable in `.env.example`, once that file reflects real adapters rather than a placeholder skeleton._

## Running tests / the evaluation harness

_TODO (Phase 8): `npm run test:all`, `npm run eval`, and how to read the resulting report._

## 5-Minute Demo Path

_TODO (Phase 9): a numbered script covering ingest → ask with citations → correct refusal → multi-agent run with live progress → approval gate → trace view → the T6 document output — written only once every one of those capabilities actually exists._

## Documentation

- [`docs/BRD.md`](docs/BRD.md) — business requirements, personas, traceability matrix
- [`docs/SYSTEM-DESIGN.md`](docs/SYSTEM-DESIGN.md) — target architecture (Part A) and implemented MVP + gap table (Part B)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — C4 diagrams, sequence/data-flow/ER diagrams, ADRs
- [`docs/SECURITY.md`](docs/SECURITY.md) — OWASP Web/LLM Top 10 controls mapped to threats
- [`docs/EVALUATION.md`](docs/EVALUATION.md) — golden set, harness, real baseline numbers
- [`docs/AGENTIC-WORKFLOW.md`](docs/AGENTIC-WORKFLOW.md) — how AI was used to build this, deliberately
- [`docs/AI-USAGE-LOG.md`](docs/AI-USAGE-LOG.md) — honest log of AI delegation, mistakes, and verification
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — branching, commit, and PR conventions

## Videos

_TODO (Phase 9): unlisted links to the product demo and teaching sample videos._

## License

MIT — see [`LICENSE`](LICENSE).
