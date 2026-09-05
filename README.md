# Domain Copilot — HR Talent Screening (D6 + T6)

An agentic RAG platform that screens candidates against a role's competency rubric — grounded, cited, bias-guarded, and gated behind human approval before anything reaches a hiring manager's desk.

**Built for:** ITI Technical Instructor (Post-Graduate Training) technical assessment.

> **Status: Phases 0-8 done** (scaffolding, domain/contracts, ingestion, retrieval/Q&A, multi-agent screening + approval gate, T6 OCR + report generation, security hardening, web UI + streaming + observability, FR-3 evaluation harness with real numbers — see `docs/SYSTEM-DESIGN.md`'s phase table). `npm run ask`/`npm run screen` work end-to-end against the real corpus and a real local Ollama; a real Fastify HTTP API serves JWT auth, ownership-scoped run/trace access and approval decisions, SSE streaming for both `/ask` (token-by-token) and `/runs` (discrete progress events), and a minimal static web UI at `/app` covering all five planned screens (ask, ingest — CLI-only, disclosed — run workflow, approval, trace). Document upload over HTTP and request cancellation remain disclosed gaps (`docs/SECURITY.md`), not silent ones. `npm run eval` reports real, honestly-interpreted numbers against a 27-case golden set (`docs/EVALUATION.md`) — including a real one that came back lower than hoped (single-shot `/ask` refusal correctness), reported as such rather than smoothed over. Phase 9 (this pass): docs finalization, the teaching pack, and the submission hygiene checklist.

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

All variables live in `.env.example` (copy to `.env` and fill in) — the table below is a summary; each variable's own comment there has the full rationale.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP API listen port |
| `NODE_ENV` | `development` | `test` switches repositories to `TEST_DATABASE_URL` (see below) |
| `JWT_SECRET` | _(placeholder — must be changed)_ | Signs auth tokens (`@fastify/jwt`) |
| `JWT_EXPIRES_IN` | `8h` | Token lifetime |
| `BCRYPT_SALT_ROUNDS` | `10` | Password hashing cost |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated exact-origin allow-list; empty blocks all browser origins |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | `100` / `60000` | `@fastify/rate-limit` burst/window |
| `DATABASE_URL` | `postgres://…@localhost:5433/domain_copilot` | Relational + pgvector store (host port 5433, not Postgres's default — see `docker-compose.yml`) |
| `TEST_DATABASE_URL` | `…/domain_copilot_test` | A second database so `npm run test:integration` doesn't truncate the tables `npm run ingest` populated for local dev (only consulted when `NODE_ENV=test`) |
| `OLLAMA_HOST` | `http://localhost:11434` | Primary LLM/embedding provider (overridden to `http://ollama:11434` inside the compose network) |
| `OLLAMA_MODEL` / `OLLAMA_EMBED_MODEL` | `llama3.2:3b` / `nomic-embed-text` | Generation and embedding models |
| `GEMINI_API_KEY` | _(empty)_ | Secondary/fallback provider — get a free key at https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | `gemini-1.5-flash` | Gemini model id |
| `LLM_PROVIDER_CHAIN` | `ollama,gemini` | Fallback order, first is primary |
| `RETRIEVAL_TOP_K` | `8` | Chunks fused per hybrid retrieval call |
| `RETRIEVAL_REFUSAL_THRESHOLD` | `0.35` | Dense cosine-similarity floor below which the system refuses rather than answers (ADR-0001) |
| `OCR_LOW_CONFIDENCE_THRESHOLD` / `OCR_UNUSABLE_THRESHOLD` | `70` / `40` | Per-page OCR confidence routing (ADR-0004) — provisional, deliberately left untuned as of Phase 8 (see `docs/EVALUATION.md`'s Failure analysis: the corpus's 5 OCR fixtures aren't a large enough sample to retune against without curve-fitting) |
| `MAX_UPLOAD_SIZE_BYTES` | `20971520` (20MB) | Upload size cap, enforced before content-sniffing |

## Running tests / the evaluation harness

```bash
npm test                  # unit tests only — no external services needed
npm run test:contract     # Zod contract tests for every agent/tool I/O shape
npm run test:integration  # requires Postgres running (see Quick start) + TEST_DATABASE_URL migrated
npm run test:all          # all three, --test-concurrency=1 (integration tests share one live DB)
npm run lint

npm run eval               # FR-3 evaluation harness — requires npm run ingest to have populated the DB first
```

`npm run eval` runs the 27-case golden set (`corpus/golden-set.json`) against the real `/ask` use case and a live Ollama model, and prints:
- **Retrieval hit-rate** and **groundedness** (deterministic lexical-overlap, no LLM-judge) per case, plus a summary.
- **Refusal correctness**, with an independent retrieval diagnostic that attributes any unexpected refusal to either genuine insufficient evidence or a citation-marker omitted by the model — this distinction is what makes the number in `docs/EVALUATION.md` interpretable rather than a bare pass rate.
- A separate block for the 5 `manualReview` cases (ambiguous + injection), which aren't reducible to a deterministic pass/fail — read `docs/EVALUATION.md`'s Failure analysis before treating a "MISMATCH" on those as a bug.

The full run's real output — not a curated excerpt — is in `docs/EVALUATION.md`'s Baseline results. Two things worth knowing before re-running it yourself: it needs `npm run ingest` to have populated the database first (a clean, un-ingested DB reports every case as a refusal, which is expected, not a broken harness), and single-shot refusal correctness runs measurably below 100% on this small local model even on well-evidenced questions — see the next section for how the demo path accounts for that.

The bias name-swap invariance metric is *not* part of `npm run eval` (a real screening run takes 30s-150s and doesn't fit a harness meant to be re-run often) — run it directly:

```bash
node --test tests/integration/rubricScorerNameSwapInvariance.test.js
```

## 5-Minute Demo Path

Every command below was actually run, in this order, against a real corpus and a real local Ollama model, while writing this section. **One thing to know going in:** this system's single-shot `/ask` refusal correctness measures at ~45.5% on this small local model (`docs/EVALUATION.md`) — not because retrieval fails, but because the model sometimes omits its citation marker on an otherwise-correct answer. If a step below refuses where this script says it should answer, **re-run that one command** — that's real, disclosed model behavior, not a broken demo. This script is also the product-demo video's shot list (see Videos, below).

Assumes [Quick start](#quick-start) is done (Postgres/Ollama up, migrated, ingested, seeded) and the server is running (`npm run dev`).

**1. Grounded Q&A with a real citation** (~10s):
```bash
npm run ask -- "What weight does the Backend Engineer rubric assign to Technical Proficiency?"
```
Expect an `Answer:` citing `rubric-backend-engineer` with weight `0.25`, and a `Citations:` line with a real `chunkId`. *(If refused: re-run once — see the note above.)*

**2. A correct refusal** (~2s, stable — nothing in this corpus is topically close to this question):
```bash
npm run ask -- "What was Northfield Digital's total revenue in its last fiscal year?"
```
Expect `Refused: insufficient_evidence` — the deterministic similarity gate fires before any generation happens (ADR-0001).

**3. Log in and start a multi-agent screening run with live progress (SSE)** (~2 min for 2 candidates — real Ollama latency, not artificial):
```bash
npm run users -- create --email "demo-hm@example.com" --password "demo-pass-123" --role hiring_manager   # idempotent-ish: errors harmlessly if it already exists
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"email":"demo-hm@example.com","password":"demo-pass-123"}' | node -e "process.stdin.once('data', d => console.log(JSON.parse(d).token))")

curl -N -X POST http://localhost:3000/runs -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"roleId":"backend-engineer","rubricId":"rubric-backend-engineer","candidateHandles":["CAND-001","CAND-004"]}'
```
Watch real `progress` events stream by (`tool.get_candidate_chunks`, `llm.evidence_extractor`, `llm.rubric_scorer`, `llm.shortlist_drafter` — each with real `.started`/`.completed` pairs, retries visible if the model needed one), ending in a `result` event with a real `runId`, `state: "AWAIT_APPROVAL"`, and a drafted shortlist with real interview probes. Copy the `runId` for the next steps.

**4. The approval gate** (~1s):
```bash
curl -s -X POST http://localhost:3000/runs/<runId>/decision -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"decision":"approved"}'
```
Expect a real `approval` record and a `finalized` shortlist — no write tool executes without this step existing first (`ApprovalRequiredError` otherwise).

**5. The trace view** (~1s):
```bash
curl -s http://localhost:3000/runs/<runId>/trace -H "Authorization: Bearer $TOKEN"
```
Expect real `trace_events` rows — real `tokensIn`/`tokensOut` per LLM call, `cost_usd: 0` (both providers are genuinely free-tier), spans matching the SSE progress events from step 3.

**6. The T6 document output** (~1s):
```bash
npm run screen -- generate --run <runId> --format docx
```
Expect `Report generated: asset <id> (docx), run <runId> -> COMPLETE.` and a real file at `reports/generated/<runId>.docx` — open it: a scoring matrix, real quoted evidence snippets next to each citation, and interview probes. **Note:** `generateReport` transitions the run straight to `COMPLETE` — generating the PDF twin (`--format pdf`) needs a separate run through steps 3-4 first, it can't be requested a second time against the same completed run.

**Total real time:** ~3 minutes of active waiting (step 3 dominates), well inside the 5-minute budget even accounting for a re-run on step 1.

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

Recording and hosting video is outside what this assistant can produce — the two shot lists below are ready to record against (the product demo is literally the [5-Minute Demo Path](#5-minute-demo-path) above, narrated); once recorded, replace this section with the two unlisted links.

**Product demo** (~5 min) — follow the 5-Minute Demo Path's 6 steps in order, narrating what each SSE event / response means as it streams. Suggested beats: 0:00 grounded Q&A + citation (step 1), 0:30 correct refusal (step 2), 1:00 kick off the screening run and narrate the live progress events as they arrive (step 3), 3:00 approval gate (step 4), 3:15 trace view — point out real token counts (step 5), 3:30 open the generated DOCX and show the scoring matrix + quoted evidence (step 6), 4:30 close on the one disclosed gap (single-shot citation reliability) so the demo doesn't imply more polish than `docs/EVALUATION.md` claims.

**Teaching sample** (~10-15 min excerpt from the 90-minute session) — suggested beats: 0:00 the "why this topic isn't theoretical" framing (`teaching/slides/slides.md`), 2:00 the real `cv-003` injection fixture read aloud (Lab Exercise 4), 5:00 a live `npm run ask --candidate CAND-003` run showing whichever real outcome occurs, 8:00 the "structural vs. prompted defense" corrected-misconception slide (`common-trainee-mistakes.md` #4) — this is the strongest, most specific moment in the whole deck since it's a real mistake this project's own docs made and caught, 11:00 one stretch challenge walkthrough.

## License

MIT — see [`LICENSE`](LICENSE).
