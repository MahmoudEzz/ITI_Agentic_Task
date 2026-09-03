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

_TODO (Phase 4/6): full description of the `redactProtectedAttributes` stage, the closed list of direct attributes and their proxies, the `bias_audit_log` schema, and the name-swap invariance test methodology and result — moved here in full once implemented, cross-referenced from `docs/EVALUATION.md` for the actual measured numbers._

## Secrets

No secrets are committed to this repository, at any point in its history. `.env.example` documents every required variable with placeholder values. A secret scan (`gitleaks`) runs in CI on every PR and is re-run over the full history before submission.

## Known residual risks (disclosed, not hidden)

_TODO: e.g. regex/lightweight-NER redaction recall limits, OCR-driven mis-extraction of a protected attribute that evaded redaction, local-model prompt-injection resistance vs. a larger hosted model — added honestly as each is actually observed during evaluation, not hypothesized in advance._
