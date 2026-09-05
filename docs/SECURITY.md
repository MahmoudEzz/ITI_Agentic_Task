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
| Strict privilege separation between system instructions and retrieved/untrusted content — every LLM call passes them as genuinely separate channels (`complete({ system, prompt })`, Ollama's `system` role / Gemini's `systemInstruction`), never concatenated into one string; every prompt file also explicitly instructs the model to treat embedded instructions in retrieved content as data, not commands, as defense in depth | Prompt injection, direct | Implemented (Phase 3 Q&A + Phase 4 agents); not yet measured against adversarial cases — that's the next row |
| ≥3 golden-set cases exercising indirect injection via ingested documents (2 CV-based, 1 via a policy document) with asserted resistance | Prompt injection, indirect via ingested documents — "the case that matters most" per the brief | Planned — Phase 8 |
| All tool arguments schema-validated (Zod) before execution (`searchCorpus`/`getCandidateChunks`); every agent's LLM output re-validated against its Zod contract, with a returned chunk/candidate id checked against what that call actually had access to, before being trusted | Insecure output handling | Implemented (agent outputs); the "never rendered as raw HTML" half is N/A until a UI exists (Phase 7) |
| Structural protected-attribute redaction actually wired between the Evidence Extractor and Rubric Scorer (`src/application/workflows/extractRedactScore.js`), not just unit-tested in isolation (see below); documented data flow of what reaches Ollama (local) vs. Gemini (hosted, leaves the machine) | Sensitive information disclosure | Implemented (issue #13); `bias_audit_log` persistence lands with the orchestrator (issue #40) |
| Per-agent tool allow-lists, real and enforced (`dispatchTool.js`'s `ToolNotAllowedError`); opaque candidate handles (no name) passed to the Rubric Scorer; no destructive/write tool without the approval gate | Excessive agency | Implemented — the gate lives in `finalize_shortlist` itself (`ApprovalRequiredError` unless a genuine, matching, approving `Approval` record exists), not only in the calling use case's flow control, verified against a real approve and a real reject round trip |
| Iteration limits (3 total attempts per structured-completion call — schema-constrained decoding primary, retry a backstop, ADR-0005) | Unbounded consumption | Implemented (this control only); token caps, per-step timeouts, request rate limits, upload payload limits — Planned, Phase 4/6 |
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

**Audit trail:** every detection produces an entry — `{ sourceChunkId, category, action: "redact"|"drop", start, end, at }`. Deliberately, **the matched text itself is never stored** — only its category and position — so the audit trail can't become a second copy of the PII it's proving was removed; anyone auditing a decision can still locate the exact span via `(sourceChunkId, start, end)` against the original chunk. (The `bias_audit_log` table and `KnexBiasAuditLogRepository` exist since Phase 4 PR A, and `extractRedactScore.js` returns exactly this audit-entry shape alongside its scores — but nothing calls `biasAuditLogRepository.createMany()` yet; that write happens once the orchestrator (issue #40) owns a `runId` to attach entries to.)

**Tested** (`tests/unit/redactProtectedAttributes.test.js`, 10 tests): each category is exercised individually; a same-sentence, gender-swapped pair ("He led..." vs "She led...") is asserted to redact to the *identical* string — the deterministic precursor to the LLM-level name-swap invariance metric. **Verified wired into the real pipeline, not just unit-tested in isolation** (issue #13): a live run against the corpus's `cv-006-hassan-ibrahim` bias fixture (gendered pronouns, marital status) produced 14 real redaction audit entries before the evidence reached the Rubric Scorer's actual prompt, confirmed via a spy on the LLM call boundary (`tests/unit/extractRedactScore.test.js`). The name-swap invariance metric itself — same evidence, a demographic-signaling name swapped, asserting identical scores — is still measured for real in `docs/EVALUATION.md` once Phase 8's golden set exists.

**Known residual risk (disclosed, not hidden):** this is regex/keyword matching, not a trained NER model. It will miss attributes phrased in ways not covered by the pattern list (e.g. an unusual nationality adjective, an indirect religious reference, a name that is itself a strong ethnicity signal — first/last names are excluded structurally by never reaching this function in the first place, per the opaque-handle design in `Candidate.js`/`RubricScorerInputSchema`, which is a stronger guarantee than redaction). Recall on this pattern list will be measured, not assumed, once real corpus evidence runs through it in Phase 4/8.

## Secrets

No secrets are committed to this repository, at any point in its history. `.env.example` documents every required variable with placeholder values. A secret scan (`gitleaks`) runs in CI on every PR and is re-run over the full history before submission.

## Known residual risks (disclosed, not hidden)

**Rubric Scorer rationale is not mechanically grounded to its evidence (LLM Top 10: overreliance).** Phase 5 added a mechanical check to `evidenceExtractor.js` requiring every evidence snippet's text to actually appear in the chunk it cites (ADR-0006's "Evidence-grounding mechanism" section) — this closed fabrication of evidence *text* out of thin air, confirmed via a real bug found live against `cv-014-heba-roshdy` (a 54-character OCR'd chunk that the pipeline initially used to justify 7 fabricated, detailed competency scores). It does not close a narrower gap one stage downstream: a model can still satisfy that check by quoting real-but-semantically-irrelevant text, and the Rubric Scorer has no check at all on whether its rationale actually relates to the evidence text it was given — live-verified doing exactly that twice, independently, across two separate real runs (fabricating specific-sounding 2-5/5 rationales from the same contact-info line each time — see `generate_report`'s own live-verification run, PR for issue #49). This can't be closed the same mechanical way (a rationale is a synthesized judgment, not a verbatim quote, so substring containment doesn't apply); closing it is scoped to Phase 6, likely via a cheaper secondary grounding check or an explicit low-evidence-volume threshold that forces `InsufficientEvidenceError` before scoring rather than after. Until then, the human approval gate (`AWAIT_APPROVAL`) is the actual control — a hiring manager sees every score and rationale before any write tool can execute.

**The generated report's citation column weakens that human-review mitigation slightly**: it currently resolves an `evidenceChunkId` to its document title and page number (`renderDocx.js`/`renderReportHtml.js`), not the actual quoted evidence text — because `scores.evidence_chunk_ids` is the only thing persisted; the snippet text itself is never stored past the Rubric Scorer call. A hiring manager reading the real report generated during PR2's live verification sees "cv-014-heba-roshdy, p.1" next to a detailed, fabricated rationale — accurate as far as it goes, but it takes an extra step (opening the source document) to notice the whole page is one contact-info line, rather than the report surfacing that mismatch directly. Persisting and displaying the actual snippet text would close this, at the cost of a schema change to `scores` (and to `RubricScorerOutputSchema`, which doesn't carry it through today) — deferred as a Phase 6 scope decision, not done speculatively here.

_Further residual risks — e.g. regex/lightweight-NER redaction recall limits, local-model prompt-injection resistance vs. a larger hosted model — added honestly as each is actually observed during evaluation, not hypothesized in advance._
