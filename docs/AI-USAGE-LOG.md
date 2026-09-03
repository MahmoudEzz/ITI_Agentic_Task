# AI Usage Log

> Honest record of what was delegated to AI, what was written manually, where the AI misled the developer, and how each was verified. An entry claiming flawless AI usage is a red flag, not a success — this log is expected to contain real mistakes.

## 2026-09-03 — Requirements analysis, variant derivation, and Phase 0 scaffolding

**Delegated to AI (Claude Code):**
- Full reading and structuring of the assessment PDF (`ITI-Instructor-Task.pdf`) into a condensed requirements brief.
- Derivation arithmetic for the assigned variant from the National ID (`29307051603297`): last-two-digits mod 7 for Domain, digit-sum mod 8 for Twist.
- Draft architecture, corpus, orchestration, security, and phased-build design (via a Plan sub-agent), covering FR-1 through FR-9, security controls, and the D6/T6-specific bias and OCR mechanisms.
- Generation of Phase 0 scaffolding: folder structure, `.gitignore`, `LICENSE`, `package.json`, doc skeletons (`BRD.md`, `SYSTEM-DESIGN.md`, `ARCHITECTURE.md`, `SECURITY.md`, `EVALUATION.md`, `AGENTIC-WORKFLOW.md`, this log), and 5 ADRs.

**Written/decided manually (by the developer, in conversation with the AI):**
- The actual National ID used for derivation.
- Tech stack (Node.js/JavaScript, not TypeScript).
- LLM provider choice (Ollama primary + Gemini secondary, explicitly rejecting a mock-only "second implementation" as insufficient).
- UI surface decision — an initial request for a Streamlit UI was corrected after the AI flagged it as incompatible with the Node.js stack (Streamlit is Python-only); resolved to a minimal static HTML/JS UI in the same repo instead of switching the whole backend to Python.
- T6 output-format scope (both DOCX and PDF, not DOCX-only).

**Where the AI got it wrong and had to be debugged empirically:**
- `npm install --save-dev eslint@9 @eslint/js prettier husky` failed with an `ERESOLVE` peer-dependency conflict: pinning `eslint@9` while leaving `@eslint/js` unpinned pulled in `@eslint/js@10`, which requires `eslint@^10`. The AI had not checked that the two packages' latest versions were mutually compatible before running the install. Fixed by installing both unpinned (`eslint@latest @eslint/js@latest`), which resolved to a matching `eslint@10`/`@eslint/js@10` pair.
- The `npm test`/`npm run test:integration` scripts were written as `node --test tests/unit` (a bare directory path). This failed immediately with `MODULE_NOT_FOUND` — Node's CJS module resolver tried to `require()` the directory itself rather than the test runner discovering files in it (an ESM/`"type": "module"` interaction the AI did not anticipate). The first fix attempt, switching to a glob (`node --test "tests/unit/**/*.test.js"`), was verified working, but *only tested under the locally installed Node v24* — glob-pattern arguments to `--test` are not supported on Node 20, which is what `engines` and the CI workflow were pinned to at the time. This was caught by deliberately testing under Node 20 and Node 22 via `nvm` after the fact, not by the AI proactively checking version compatibility across dev/CI before declaring the fix done. Resolved by bumping `engines`, `ci.yml`, and the `Dockerfile` to Node 22 everywhere, and confirming both `npm test` and `npm run lint` pass under that exact version — the lesson generalized to "verify against the pinned CI version, not whatever happens to be installed."
- The AI's first-pass UI question offered CLI/TUI vs. minimal-web-UI as the choices; when the developer asked for Streamlit, the AI did not silently attempt to bolt Python onto a Node.js repo — it surfaced the language mismatch explicitly and asked how to resolve it, rather than guessing.

**Verification:**
- Variant derivation arithmetic (97 mod 7 = 6; 54 mod 8 = 6) checked by hand against the brief's stated formula before being treated as final.
- Architecture/ADR content was reviewed by the developer for internal consistency (e.g. the orchestration ADR and the sequence-diagram placeholder in `ARCHITECTURE.md` describe the same state machine) before being committed, not committed unread.
- After the Node-version issue above, `npm test` and `npm run lint` were re-run explicitly under Node 20 (failed, as expected) and Node 22 (passed) via `nvm exec`, rather than trusting the fix on the strength of it passing once under an unpinned local Node version.

## 2026-09-03 — GitHub process setup and Phase 1 domain/contracts work

**Delegated to AI (Claude Code):**
- GitHub process setup: `gh` CLI install/auth, repo made public, branch protection (0 required approvals, `enforce_admins` on, 2 required CI checks), 10 milestones, initial Phase 1 issues, reviewing and merging 3 legitimate Dependabot PRs (closing a 4th that contradicted the Node 22 pin).
- Phase 1 implementation: 9 domain entities with real invariants (`Run.transition()` state machine, `Rubric`/`Score` composite-math validation), Zod contracts for agent I/O and the 4 required tools, and the `redactProtectedAttributes` bias-safety service — each as its own PR, closing issues #6/#7/#8.

**Where the AI got it wrong and had to be debugged or corrected:**
- Ran `docker compose up ollama ollama-pull` in the background to verify the Ollama model-pull design, then waited for a "task completed" notification that could never arrive: `ollama-pull` exits on success, but `ollama` runs forever, and `docker compose up` stays attached to both. The plan was structurally wrong, not just slow — polling the log for progress percentages for over an hour before recognizing this. Fixed by splitting into `docker compose up -d ollama` (detached) + `docker compose run --rm ollama-pull` (exits on its own), which is also the more correct way to test a one-shot init container in general.
- `gh api -X PUT repos/.../branches/main/protection/enforce_admins` returned 404. The endpoint is POST, not PUT — a GitHub API detail the AI got wrong on the first attempt and had to look up empirically from the error rather than knowing in advance.
- A `git add` staging mistake: added the docker-compose wording-fix file and the (already-staged) new entity files in one `git add`, then committed, producing one commit that bundled two unrelated changes. Caught immediately by reading the commit's file list, undone with `git reset --soft HEAD~1` before pushing (nothing published, so no history rewrite of shared state), and re-committed as two atomic commits.
- `ChunkResultSchema` declared `section`/`page`/`ocrConfidence` as `.nullable()` but not `.optional()`, meaning a retrieval adapter that omitted those keys entirely (a real, likely shape) would fail validation for no functional reason. Not caught by any test — the original 9 contract tests only ever exercised fully-populated payloads. Found during a design review, not by a failing test; fixed alongside adding the missing coverage.
- Two tool output schemas (`FinalizeShortlistOutputSchema`, `GenerateReportOutputSchema`) had zero test coverage and used `z.string().datetime()`, Zod 4's soft-deprecated spelling, rather than `z.iso.datetime()`. Also found during design review, not by a failing test. Verified both spellings currently validate identically on the installed `zod@4.5.4` before switching, rather than assuming the deprecation mattered functionally yet.
- A redaction test fixture ("Native English speaker with excellent writing skills.") was short enough that the matched phrase alone exceeded the drop-ratio threshold, causing the test to fail with a null-snippet dereference. This was the drop-threshold logic working correctly against an unrealistically terse example, not a bug in the redaction function — fixed by lengthening the test sentence to something a real CV bullet would look like, not by loosening the threshold.

**Verification:**
- `docker compose exec ollama ollama list` confirmed both `llama3.2:3b` and `nomic-embed-text` actually landed after the corrected two-step compose sequence — not just that the commands exited 0.
- `docker compose down; docker compose up -d ollama` (with `.env` deleted) was run explicitly to confirm the earlier `env file not found` error only occurs when config-parsing the *entire* compose file (e.g. `docker compose config -q`), not when starting a specific service that doesn't need it — this shaped the exact wording used in the README rather than a guessed claim about compose's behavior.
- Every fix above was re-run through `npm test`, `npm run test:contract`, and `npm run lint` before being committed, and each PR's CI (`build-lint-test`, `secret-scan`) was checked green before merge.
