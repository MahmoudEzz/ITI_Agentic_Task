# Business Requirements Document — Domain Copilot (D6 + T6)

> Status: living document, updated in the same PR as each requirement/decision it describes. This skeleton is populated incrementally through the build; sections marked `_TODO (Phase N)_` are not yet written.

## 1. Context

An organisation's HR team screens candidates against role requirements using a competency-based rubric. Recruiters and hiring managers currently do this manually across scattered CVs, job descriptions, and an interview playbook — slow, inconsistent, and vulnerable to unconscious bias. Domain Copilot ingests the candidate/role corpus, answers grounded questions about it with citations, and runs a supervised multi-agent screening workflow (extract evidence → score against rubric → draft shortlist) that a hiring manager must approve before any candidate-facing document is produced.

**Assigned variant:** D6 (HR — Talent Screening) + T6 (Document In/Out), derived from National ID `29307051603297` per the assessment brief's derivation rule (no variant was supplied directly):
- Domain = last two digits of the ID (`97`) mod 7 = 6 → **D6**
- Twist = sum of all digits of the ID (`54`) mod 8 = 6 → **T6**

## 2. Personas

- **Recruiter** — ingests job descriptions, rubrics, and candidate CVs; runs the screening workflow; cannot approve or finalize a shortlist.
- **Hiring Manager** — everything a Recruiter can do, plus: approves, rejects, or edits-and-approves a drafted shortlist; the only role that can trigger `finalize_shortlist` / `generate_report`; views the bias audit trail.

## 3. Objectives (measurable)

_TODO (Phase 3-4): fill in with concrete, measurable acceptance targets, e.g. retrieval hit-rate ≥ X%, refusal correctness ≥ Y%, name-swap score-invariance = 100% on the golden set, once the evaluation harness (FR-3) produces real baseline numbers. Objectives will not be invented before there is a number to hold them to._

## 4. Requirements (uniquely ID'd, BR-xx)

_TODO: populated incrementally as each FR/phase lands. Each entry: ID, statement, acceptance criteria, linked implementation evidence (file/PR/test)._

## 5. Explicit out-of-scope

- Full multi-tenant isolation (T0) — not the assigned twist. Object-ownership scoping is implemented instead (a Recruiter/Hiring Manager sees only pools/runs they created); see `docs/SYSTEM-DESIGN.md` Part B gap table.
- PDF generation via anything other than the Puppeteer HTML→PDF path.
- A managed vector database, secrets manager, autoscaling, or any other target-architecture component listed in `docs/SYSTEM-DESIGN.md` Part A that is not present in Part B.
- Languages other than English/Arabic-agnostic handling — T1 (bilingual) is not the assigned twist; no Arabic-specific retrieval tuning is claimed.

## 6. Business rules

- No claim about a candidate may be made without a citation to a retrieved chunk; if evidence is insufficient, the system must refuse rather than infer.
- No protected attribute (or its documented proxies) may reach the Rubric Scorer's evidence payload, by construction, not by prompting.
- No write/side-effecting tool (`finalize_shortlist`, `generate_report`) executes without an explicit Hiring Manager approval, reject, or edit-and-approve action.
- A CV chunk with OCR confidence below the documented "unusable" threshold is excluded from automatic scoring and requires human review.

## 7. Assumptions

Recorded as agreed during planning (see `docs/SYSTEM-DESIGN.md` and the ADRs in `docs/adr/` for full rationale):

- Rubric: 6-8 competencies, 1-5 Likert scale with behavioral anchors, equal-weighted composite score by default.
- Interview probes: 2-3 targeted, evidence-referencing questions per candidate per weak/ambiguous competency.
- Isolation: ownership-scoping (per-recruiter), not full multi-tenant isolation.
- OCR confidence thresholds (provisional: <70 low-confidence, <40 unusable) are tuned once Phase 5 produces real OCR output on the synthetic scanned-CV fixtures; the tuning process is documented, not just the final numbers.
- The protected-attribute list is closed and explicit (see `docs/SECURITY.md`); residual redaction-recall risk is disclosed rather than implied to be zero.
- Corpus, rubrics, and all CV content are synthetic; any resemblance to real people is coincidental and was spot-checked during authoring.

## 8. Risks

_TODO: populated as risks materialize during the build (e.g. structured-output reliability on a small local model — see ADR-005); tracked here rather than only in retrospective docs._

## 9. Traceability matrix

_TODO: `BR-xx → implemented / partial / deferred → evidence (file / PR / test)`, populated as each requirement is delivered. Will not be back-filled from memory — each row is added in the PR that implements it._
