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

## 2026-09-03 — Bulk chat log preservation

_TODO if applicable: if this conversation's full transcript is exported and included as supplementary evidence for the teaching pack or AI-usage narrative, note it here with its location._
