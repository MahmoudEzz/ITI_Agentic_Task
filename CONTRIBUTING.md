# Contributing

This is a solo assessment submission, but it follows real team discipline throughout — the process itself is part of what's being graded and taught.

## Branching & PRs

- No direct pushes to `main`, even solo. Every change lands via a pull request from a feature branch.
- Branch naming: `phase-<n>-<short-description>`, e.g. `phase-2-ingestion-pipeline`.
- Each PR links a GitHub Issue (`Closes #12`) and includes: **what** changed, **why**, and **how it was tested**.
- Every PR is self-reviewed with inline comments before merge — treat it as if a colleague will read it.
- CI (lint, tests, dependency scan, secret scan) must be green before merge.

## Commits

- [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`, `ci:`.
- Commit messages explain **why**, not just what changed — the diff already shows what changed.
- Atomic commits: one logical change per commit. No multi-thousand-line dumps, no `WIP`/`fix2`/`final-final`, no commented-out code left behind.

## Architecture rules

See [`CLAUDE.md`](CLAUDE.md) for the enforced Hexagonal layer-dependency rules (`domain` and `application` must not import an LLM SDK, vector-store SDK, or web framework) and general project conventions. These are checked by `eslint.config.js`'s `no-restricted-imports` rules, not just documented.

## Documentation

`docs/BRD.md`, `docs/SYSTEM-DESIGN.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, and `docs/EVALUATION.md` are living documents — update the relevant one in the same PR as the change it describes.

## Tests

- Unit tests (`tests/unit/`): domain and application logic, LLM calls stubbed.
- Contract tests (`tests/contract/`): every agent/tool I/O validated against its Zod schema in `src/contracts/`.
- Integration tests (`tests/integration/`): ingestion and retrieval against a real dockerized Postgres.

Ten sharp tests beat a hundred trivial ones — a new test should be able to fail for a real reason.
