# Security — Domain Copilot (D6 + T6)

> Status: living document. Each control below is added in the same PR that implements it, mapped against the specific threat it addresses — not written retroactively as a checklist pass.

## OWASP Web Top 10

| Control | Threat addressed | Status |
|---|---|---|
| Object-ownership checks (`createdBy` scoping, server-enforced) on documents/candidates/runs | Broken access control — a recruiter reading/acting on another recruiter's pool | Planned — Phase 6 |
| JWT auth (`@fastify/jwt`) + `bcrypt` password hashing | Cryptographic failures — plaintext/weak credential storage | Planned — Phase 6 |
| Parameterized queries throughout (Knex, no raw string interpolation except the documented pgvector `<=>` escape hatch) | SQL injection | Planned — Phase 2 |
| Upload validation via content-sniffing (`file-type`), not extension trust; size limits | Malicious/oversized file upload | Planned — Phase 2 |
| `@fastify/rate-limit` per IP/user | Abuse, credential stuffing, cost-exhaustion via request flooding | Planned — Phase 6 |
| `@fastify/helmet` security headers + explicit CORS allow-list | Security misconfiguration | Planned — Phase 6 |
| `npm audit` + `gitleaks` in CI, committed lockfile | Dependency/supply-chain risk, secret leakage | Planned — Phase 0 |
| Audit logging (auth events, approval actions, tool calls) that never logs request bodies containing secrets or raw candidate PII | Auditable security logging without sensitive disclosure | Planned — Phase 6 |

## OWASP LLM Top 10

| Control | Threat addressed | Status |
|---|---|---|
| Strict privilege separation between system instructions and retrieved content (retrieved chunks are never concatenated into the instruction-bearing part of a prompt) | Prompt injection, direct | Planned — Phase 4 |
| ≥3 golden-set cases exercising indirect injection via ingested documents (2 CV-based, 1 via a policy document) with asserted resistance | Prompt injection, indirect via ingested documents — "the case that matters most" per the brief | Planned — Phase 8 |
| Model output never rendered as raw HTML, never passed to a shell/SQL/file-path unvalidated; all tool arguments schema-validated (Zod) before execution | Insecure output handling | Planned — Phase 4 |
| Structural protected-attribute redaction before evidence reaches the Rubric Scorer (see below); documented data flow of what reaches Ollama (local) vs. Gemini (hosted, leaves the machine) | Sensitive information disclosure | Planned — Phase 4/6 |
| Per-agent tool allow-lists; opaque candidate handles (no name) passed to the Rubric Scorer; no destructive/write tool without the approval gate | Excessive agency | Planned — Phase 4 |
| Token caps, iteration limits (max 2 retries/step), per-step timeouts, request rate limits, upload payload limits | Unbounded consumption | Planned — Phase 4/6 |
| Pinned dependencies, committed lockfile, CI dependency scanning | Supply chain | Planned — Phase 0 |

## Bias / protected-attribute exclusion (D6's named risk)

Implemented as a pure, deterministic domain service — `src/domain/services/redactProtectedAttributes.js` — that runs on every evidence snippet before it can reach the Rubric Scorer. No LLM call, no network access: the exclusion cannot be prompted around because it happens before an LLM ever sees the text.

**Closed attribute list** (`PROTECTED_ATTRIBUTE_CATEGORIES` in that file is the single source of truth; this table mirrors it):

| Category | Kind | Example trigger |
|---|---|---|
| gender | direct | pronouns (he/she/him/her), gendered titles (Mr./Mrs./Ms.) |
| age_or_dob | direct | "34 years old", a DOB-shaped date, "born in 1990" |
| marital_status | direct | married/single/divorced/widowed/spouse/husband/wife |
| religion | direct | named religions/denominations |
| nationality_or_ethnicity | direct | a curated list of nationality adjectives |
| disability | direct | disability/disabled/wheelchair/visually or hearing impaired |
| photo | direct | an embedded photo/image marker |
| graduation_year_proxy | proxy | "graduated in 20XX", "class of 20XX" — age proxy; **duration** of experience is deliberately left untouched, only the calendar year is redacted |
| native_speaker_proxy | proxy | "native English speaker", "mother tongue" |
| career_gap_proxy | proxy | maternity/paternity/parental leave, career break, gap year |

**Redact vs. drop:** each match is redacted in place as `[REDACTED:CATEGORY]`. If matched spans cover more than 40% of a snippet's length, the whole snippet is dropped rather than left partially redacted (a heavily-flagged snippet is more likely to still be identifying even after redaction). Both outcomes are logged.

**Audit trail:** every detection produces an entry — `{ sourceChunkId, category, action: "redact"|"drop", start, end, at }`. Deliberately, **the matched text itself is never stored** — only its category and position — so the audit trail can't become a second copy of the PII it's proving was removed; anyone auditing a decision can still locate the exact span via `(sourceChunkId, start, end)` against the original chunk. (`bias_audit_log` as a persisted table is Phase 4/6 — this service returns audit entries as plain data today; persistence is an adapter concern layered on top, not yet wired up.)

**Tested** (`tests/unit/redactProtectedAttributes.test.js`, 10 tests): each category is exercised individually; a same-sentence, gender-swapped pair ("He led..." vs "She led...") is asserted to redact to the *identical* string — the deterministic precursor to the LLM-level name-swap invariance metric that will be measured for real in `docs/EVALUATION.md` once Phase 4's Rubric Scorer exists to test end-to-end.

**Known residual risk (disclosed, not hidden):** this is regex/keyword matching, not a trained NER model. It will miss attributes phrased in ways not covered by the pattern list (e.g. an unusual nationality adjective, an indirect religious reference, a name that is itself a strong ethnicity signal — first/last names are excluded structurally by never reaching this function in the first place, per the opaque-handle design in `Candidate.js`/`RubricScorerInputSchema`, which is a stronger guarantee than redaction). Recall on this pattern list will be measured, not assumed, once real corpus evidence runs through it in Phase 4/8.

## Secrets

No secrets are committed to this repository, at any point in its history. `.env.example` documents every required variable with placeholder values. A secret scan (`gitleaks`) runs in CI on every PR and is re-run over the full history before submission.

## Known residual risks (disclosed, not hidden)

_TODO: e.g. regex/lightweight-NER redaction recall limits, OCR-driven mis-extraction of a protected attribute that evaded redaction, local-model prompt-injection resistance vs. a larger hosted model — added honestly as each is actually observed during evaluation, not hypothesized in advance._
