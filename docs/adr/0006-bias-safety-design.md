# ADR-0006: Bias-safety design (D6's named risk)

## Status

Proposed (mechanism implemented since Phase 1; wired into the actual pipeline in Phase 4 — see issue #13; flip to Accepted once the name-swap invariance metric runs for real against Phase 4's Rubric Scorer)

## Context

D6 (HR talent screening) names bias as the risk to guard against: a scoring pipeline must not let protected attributes (or their proxies) influence a candidate's score, and that guarantee must be structural, not a matter of prompting a model to "be fair." Five source comments across `src/contracts/agents.js`, `src/domain/entities/{Candidate,Evidence,Chunk}.js`, and `src/domain/services/redactProtectedAttributes.js` cite "ADR-0004" for this design — that file is actually titled *T6 twist: OCR and document generation approach* and has nothing to do with bias safety. This ADR is the one those comments meant to cite; they're corrected to point here in the same PR that adds this file.

## Decision

Two independent, structural mechanisms — not one, because they close different gaps:

1. **Schema-level name exclusion.** `RubricScorerInputSchema` (`src/contracts/agents.js`) is `.strict()` and has no field capable of carrying a candidate's real name — only an opaque handle (`CAND-N`, enforced by regex in `Candidate.js`/`Evidence.js`). This is the stronger of the two guarantees: a name cannot reach the Rubric Scorer's payload at all, regardless of what the redaction pass below does or misses.
2. **Deterministic redaction of protected-attribute *language*.** `src/domain/services/redactProtectedAttributes.js` — a pure function, zero I/O, zero LLM call — scans evidence snippet text for a closed, documented list of direct attributes (gender, age/DOB, marital status, religion, nationality/ethnicity, disability, photo) and proxies (graduation year, native-speaker phrasing, career-gap phrasing), redacting matched spans or dropping the whole snippet if matches exceed a 40% coverage threshold. Every detection is logged as `{ sourceChunkId, category, action, start, end, at }` — the matched text itself is never stored, only its category and position, so the audit trail can't become a second copy of the PII it's proving was removed.

**Both matter because they cover different failure modes**: (1) stops a name from reaching the model; (2) stops attribute language *within the evidence text itself* (e.g. "she," "graduated in 1998," "on maternity leave") from reaching it. A schema check alone would pass evidence text riddled with gendered pronouns straight through.

**Wiring (Phase 4, issue #13):** `redactEvidenceSnippets` must actually run on every evidence snippet between the Evidence Extractor and Rubric Scorer steps in the orchestrator — being unit-tested in isolation since Phase 1 was necessary but not sufficient; nothing bound it to the pipeline until now. The acceptance bar is a test asserting against the **actual prompt string** handed to the Rubric Scorer's `llmProvider.complete()` call, not merely that the input object satisfies the schema — the schema only proves no name *field* exists, not that attribute language was scrubbed from the evidence text.

**Audit persistence:** `bias_audit_log` (Phase 4 migration) makes the audit entries this function already returns queryable per run, rather than computed and discarded.

## Alternatives considered

- **LLM-based redaction (ask the model to strip protected attributes before scoring)** — rejected outright: this is exactly the "prompted around" failure mode D6's risk framing warns against. A prompt instruction is not a structural guarantee; a pure function that runs before any LLM sees the text is.
- **A trained PII/NER model instead of regex** — likely better recall, but adds a model dependency and inference cost for a 40-hour build, and its own failure modes (a model can also be wrong) aren't obviously more auditable than a documented, testable pattern list. Regex/keyword matching's recall limit is disclosed candidly in `docs/SECURITY.md` rather than hidden or overclaimed as a substitute for an audited model; this is a mitigation, not a guarantee.
- **Redact-only, never drop** — considered simpler, but a snippet where matches cover most of the text is plausibly still identifying even with terms replaced (e.g. a short bio that is almost entirely redacted markers). Dropping above a coverage threshold, and logging the drop, was judged safer than a false sense of anonymization.

## Evidence-grounding mechanism (Phase 5 addition — a related but distinct control)

Not a bias-safety mechanism, but it lives here because it's the same design pattern applied one stage earlier: a structural, mechanical check on the Evidence Extractor's output, not a prompt instruction trusted on its own.

**The gap it closes:** `EvidenceExtractorOutputSchema`'s original `.refine()` (Phase 4) only checked that a snippet's `sourceChunkId` referenced a chunk the agent actually fetched — it never checked that the snippet's *text* was actually present in that chunk. A real chunk id is necessary but not sufficient: the model could cite a genuine chunk while inventing evidence text that chunk never contained. This was discovered live in Phase 5, not hypothesized: `cv-014-heba-roshdy`'s only chunk is a 54-character OCR'd line (`"heba.roshdy.analytics@example-mail.com | Cairo, Egypt"` — see ADR-0004's OCR-completeness caveat), and the Evidence Extractor initially produced detailed, fabricated evidence for all 7 competencies citing that one chunk, which the pre-existing check accepted because the chunk id was real.

**The fix:** a second `.refine()` on `EvidenceExtractorOutputSchema` (`src/application/agents/evidenceExtractor.js`) requiring each snippet's text (whitespace/case-normalized) to be a substring of its cited chunk's actual content. Mechanical containment, not similarity scoring or an LLM judgment call — consistent with this ADR's own rejection of "ask the model to police itself." Verified against real corpus CVs first: extracted snippets for native-text candidates (e.g. CAND-010) are genuinely verbatim contiguous spans of their source chunks, so the check doesn't manufacture false positives against real, honest extraction.

**Residual risk, found and disclosed, not hidden:** the fix eliminates fabrication of evidence *text* — it cannot eliminate a model quoting real-but-semantically-irrelevant text to satisfy the check. Live-verified on `cv-014-heba-roshdy`: across repeated runs, the Evidence Extractor sometimes correctly refuses (omitting competencies with no real evidence, which is InsufficientEvidenceError's intended path), and sometimes satisfies the grounding check by quoting the one available contact-info line for every competency — after which the **Rubric Scorer**, which has no grounding check of its own on the relationship between a rationale and the evidence text it was given, fabricated detailed, specific-sounding rationales and 2-4/5 scores from that irrelevant line. This is a genuine, currently-uncontrolled gap: `RubricScorerOutputSchema`'s two `.refine()`s validate `evidenceChunkIds` membership and per-competency completeness, not rationale-to-evidence relevance. Closing it mechanically is harder than the Evidence Extractor case — a rationale is a synthesized judgment, not a verbatim quote, so substring containment doesn't apply — and is scoped to Phase 6 (`docs/SECURITY.md`'s LLM-Top-10 overreliance control), not fixed here. The mitigation until then is the human approval gate: a hiring manager reviewing `AWAIT_APPROVAL` sees the score and rationale before any write tool executes.

## Consequences

- The Rubric Scorer never sees a name (schema-structural) and never sees protected-attribute language that matched the pattern list (redaction-structural) — but recall on the pattern list is not 100%, and that residual risk is measured (via the name-swap invariance test, once Phase 4's real Rubric Scorer exists) rather than assumed away.
- `bias_audit_log` gives a hiring manager a queryable record of exactly what was redacted or dropped per run, satisfying the "audit trail proving it" half of D6's risk framing — not just the mitigation itself.
- Every source comment claiming this design cites this file now, not ADR-0004 (T6/OCR), which was always about a different topic entirely.
