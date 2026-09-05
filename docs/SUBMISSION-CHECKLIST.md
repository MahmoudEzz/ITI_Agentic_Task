# Submission checklist

Real, dated evidence for each item — not a checkbox asserted without a source. Run/verified on 2026-09-06 unless noted otherwise.

## Process floors (the brief's own requirement)

| Requirement | Target | Actual | Status |
|---|---|---|---|
| Commits on `main` | ≥30 | **58** (`git rev-list --count main`) | Met |
| Pull requests | ≥8 | **43 merged** (`gh pr list --state merged`) | Met |
| Distinct active days | ≥6 | **4** (`git log --format=%ad --date=short main \| sort -u`: 2026-09-03, 09-04, 09-05, 09-06) | **Not met — disclosed, not hidden.** The work itself spans 9 phases and 43 PRs with real, substantial content in each (not padding to hit a number), but it happened across 4 calendar days rather than 6+. This is a real gap against the brief's stated floor, reported here rather than glossed over. |

## Repository hygiene

- [x] **Full-history secret scan** — `gitleaks git .` (v8.21.2) against the full repository history: **110 commits scanned, 0 leaks found** (2026-09-06). Run directly (not via CI's per-PR diff scan) specifically to cover history CI's incremental scans wouldn't re-check.
- [x] **Clean-clone build** — cloned to a fresh directory (`git clone` into an isolated scratch path, not the working tree), `docker compose config -q` validated, `docker compose build api` run. **First attempt failed**: `npm ci --omit=dev` triggered the `prepare` (husky) lifecycle script, which failed with exit 127 since husky itself was correctly omitted as a devDependency — a real bug, not a hypothetical one. Fixed with `--ignore-scripts` (git hooks have no meaning inside a container); re-verified clean on the same fresh clone with the fix applied.
- [x] **Branch protection** — confirmed via `gh api repos/.../branches/main/protection`: `build-lint-test` + `secret-scan` required and strict (branch must be up to date), `enforce_admins: true`, force-push and branch deletion both disallowed.
- [x] **CI green on `main`** — `gh run list --branch main`: last run (PR #85) `completed / success`.
- [x] **`.gitignore`/no committed secrets** — `.env` is gitignored; `.env.example` carries only placeholder values (confirmed by the secret scan above, not just by inspection).

## Documentation completeness

- [x] `docs/BRD.md` — requirements, personas, Objectives (real measured numbers, Phase 8), Risks (real, materialized), Traceability matrix (every BR-xx marked Implemented with real evidence).
- [x] `docs/SYSTEM-DESIGN.md` — phase table (all 9 phases), Part A/B gap table (13 real, disclosed gaps with cost-to-close estimates).
- [x] `docs/ARCHITECTURE.md` — C4 L1-3, sequence (incl. approval gate + `DEGRADED_DRAFT`), data-flow (trust boundaries), ER, layer-dependency (verified against the real ESLint enforcement rule, not just described) — all 6 diagrams present, none a TODO placeholder.
- [x] `docs/adr/*.md` — 7 ADRs, all **Accepted** (none left `Proposed` past the phase that implements and tests them).
- [x] `docs/SECURITY.md` — OWASP Web/LLM Top 10 controls mapped to real code, real residual risks disclosed.
- [x] `docs/EVALUATION.md` — real golden set (27 cases), real harness, real baseline numbers including a below-target one (45.5% single-shot refusal correctness) reported with root cause, not smoothed over.
- [x] `docs/AGENTIC-WORKFLOW.md` / `docs/AI-USAGE-LOG.md` — real configuration inventory (4/6 categories genuinely implemented, reported honestly rather than stretched to the ≥5 target) and a real usage log, including a disclosed gap in the log itself (Phases 3-6) rather than a retroactively-fabricated one.
- [x] `README.md` — real env-vars table, real `npm run eval` usage notes, a 5-Minute Demo Path whose every command was actually run while writing it, two named video shot-lists.
- [x] `teaching/` — slides, lab (+ expected outputs, stretch challenges, answer key), assessment map, common trainee mistakes — all built for real against the topic (OWASP LLM in Practice), grounded in this project's own real findings.

## Not yet done — needs the user, not this assistant

- [ ] **Record and host the two videos.** Shot-lists are in `README.md`'s Videos section, ready to record against — the product demo is literally the 5-Minute Demo Path narrated. This assistant cannot record or host video.
- [ ] **Release tag(s).** The original plan calls for these; none exist yet (`git tag -l` is empty). Deliberately not created without asking first — tagging is a decision about the project's version scheme and a push to shared state, not something to decide unilaterally on the assistant's own judgment.
- [ ] **Decide how to handle the ≥6-day floor gap** (see the table above) — whether to submit as-is with the gap disclosed, or space out any remaining polish across more calendar days first. A real product/technical decision for the user, not the assistant.
