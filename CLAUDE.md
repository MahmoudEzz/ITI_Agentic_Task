# Domain Copilot — project instructions

Agentic RAG platform for HR talent screening. Variant **D6 (HR Talent Screening) + T6 (Document In/Out)**. Node.js/JavaScript (plain JS, not TypeScript), Fastify, PostgreSQL+pgvector, Ollama (primary) + Gemini (secondary) behind one provider interface. Full design: see `/Users/mahmoudezz/.claude/plans/i-have-passed-the-splendid-sutherland.md` and `docs/ARCHITECTURE.md`.

## Non-negotiable architecture rule

Hexagonal (Ports & Adapters). Enforce strictly:

- `src/domain/**` — **zero external dependencies.** No LLM SDK, no vector-store SDK, no `pg`/`knex`, no `fastify`, no npm package beyond the JS standard library and `zod` (used only for the domain's own invariant checks, not adapter concerns).
- `src/application/**` — imports only `src/domain` and `src/contracts`, plus the *port interfaces* it defines itself in `src/application/ports`. Never imports a concrete adapter from `src/adapters`.
- `src/adapters/**` — implements ports; free to import any SDK/library it needs.
- `src/infra/**` — the only place allowed to import from `adapters` AND wire them into `application` via the DI container (`awilix`). This is the composition root.

If a change to `domain` or `application` seems to require importing an LLM/vector-store/web-framework package, stop and introduce a port method instead — that need is exactly what the port abstraction exists to satisfy, and it is also the mechanism graded by the assessment's "swap provider = config + one adapter" acceptance test.

## Conventions

- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`), atomic, explain *why* not *what*. No `WIP`/`fix2`/`final-final`, no commented-out code.
- All work lands via PR (even solo) — no direct pushes to `main` once branch protection is enabled in Phase 0.
- Agent/tool I/O contracts live in `src/contracts/` as Zod schemas — this is how "typed contracts, not free-form text" (FR-4) is satisfied without TypeScript. Every new agent or tool needs a contract here before it needs an implementation.
- Prompts are files in `prompts/`, never inline template strings in application/adapter code.
- Every LLM call goes through `LLMProviderPort` — never call an Ollama/Gemini SDK directly from `application` or `domain`.
- Protected-attribute redaction (`src/domain/services/redactProtectedAttributes.js`) is a pure, deterministic function. It must never call an LLM — the whole point of the bias-safety design is that this stage cannot be prompted around.
- Docs in `docs/` are living documents: update the relevant one (BRD/SYSTEM-DESIGN/ARCHITECTURE/SECURITY/EVALUATION) in the *same PR* as the change it describes, not retroactively.

## What NOT to do

- Don't add TypeScript, a second web framework, or an ORM beyond Knex — stack is settled.
- Don't reach for LangChain/LlamaIndex-style orchestration frameworks — the orchestrator is a hand-rolled FSM by design (ADR-0002), so it can be fully explained and taught line-by-line.
- Don't invent numbers in `docs/EVALUATION.md` or `docs/BRD.md` objectives ahead of `npm run eval` actually producing them.
- Don't mark a `docs/adr/*.md` as "Accepted" until the phase it describes has actually landed and been tested.
