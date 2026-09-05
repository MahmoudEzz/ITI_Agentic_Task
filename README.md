# Domain Copilot — HR Talent Screening (D6 + T6)

An agentic RAG platform that screens candidates against a role's competency rubric — grounded, cited, bias-guarded, and gated behind human approval before anything reaches a hiring manager's desk.

**Built for:** ITI Technical Instructor (Post-Graduate Training) technical assessment.

> **Status: Phases 0-4 done** (scaffolding, domain/contracts, ingestion, retrieval/Q&A, multi-agent screening + approval gate — see `docs/SYSTEM-DESIGN.md`'s phase table). `npm run ask` (grounded Q&A with citations/refusal) and `npm run screen` (full role/candidate-pool screening through human approval) both work end-to-end against the real corpus and a real local Ollama. No T6 document generation, security hardening, or web UI yet — not a finished demo. This README grows into the full "assume the reader has Docker and 15 minutes" quick-start as each remaining phase lands.

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

The HTTP API (`npm run dev`/`npm start`) and structured rubric/competency seed data (`npm run seed`) land with Phases 4 and 7. What's real and verified today — ingestion end-to-end against real Postgres+pgvector and the full 42-document corpus:

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

The `api` service has nothing to serve yet (`src/adapters/http/server.js` doesn't exist until Phase 7).

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
