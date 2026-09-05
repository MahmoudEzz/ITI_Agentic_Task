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

| ID | Statement | Acceptance criteria | Status |
|---|---|---|---|
| BR-01 | The system ingests documents in at least 2 source formats | `.txt`, `.docx`, and `.pdf` all extract to real text via a dedicated adapter per format | Implemented |
| BR-02 | A scanned/image-only PDF is detected and flagged, never silently ingested as empty | Extraction yield below a chars-per-page threshold sets `needs_ocr`; verified against 5 real scanned-CV fixtures in the corpus, all correctly flagged | Implemented (OCR itself deferred to Phase 5, T6) |
| BR-03 | Re-running ingestion on an unchanged corpus is a no-op | Re-ingesting all 42 corpus documents completes in <1s with 0 new embedding calls when content and chunker version are both unchanged | Implemented |
| BR-04 | A change to the chunking strategy re-chunks previously-ingested documents even if their source content hasn't changed | Chunk rows carry a `chunkerVersion`; ingestion compares it against the current version and re-chunks on mismatch | Implemented |
| BR-05 | A single document's ingestion failure does not abort a batch ingest | Every ingestion outcome (indexed/needs_ocr/skipped/failed) is a returned status, never a thrown error, at both the per-document and batch level | Implemented |
| BR-06 | Chunking is a deliberate, documented decision justified against the corpus's actual structure | ADR-0001; structure-aware section/experience-entry detection verified against real corpus CVs and a policy document, not only synthetic fixtures | Implemented |
| BR-07 | Hybrid (dense + keyword) retrieval with a documented fusion method | Reciprocal Rank Fusion (k=60) over pgvector cosine similarity + Postgres full-text search; unit-verified, exposed via `answerQuestion` (BR-10) | Implemented |
| BR-08 | No claim may be made without evidence; insufficient evidence produces a refusal, not an inference | Refusal decision is deterministic (raw dense cosine similarity vs. a configured threshold), computed before any LLM call, never the model's own self-assessment | Implemented |
| BR-09 | The system works with at least 2 genuinely working LLM providers behind one interface, with a documented fallback | `LLMProviderPort.complete`; real `OllamaProvider` (local) and `GeminiProvider` (hosted) implementations, `FallbackLLMProvider` tries each in `LLM_PROVIDER_CHAIN` order | Implemented |
| BR-10 | Grounded Q&A: retrieve, answer, cite, or refuse — the first demoable slice (FR-2) | `npm run ask` answers a real in-corpus question with citations resolving to actual chunk IDs; an out-of-corpus question refuses; both verified against the live ingested database, not fixtures | Implemented |
| BR-11 | Three agents (Evidence Extractor, Rubric Scorer, Shortlist Drafter), each with an explicit role, a restricted tool allow-list, and a typed I/O contract (FR-4) | `src/application/agents/*.js`; `dispatchTool.js`'s `ToolNotAllowedError` is the real, tested mechanism behind the allow-list claim, not an absence of code that happens not to call a tool | Implemented |
| BR-12 | Protected-attribute redaction is structurally wired into the pipeline between evidence extraction and scoring, not merely unit-tested in isolation (D6's named risk) | `src/application/workflows/extractRedactScore.js`; verified against the actual prompt string handed to the Rubric Scorer's LLM call (not just schema satisfaction) and against a real bias-fixture CV in the corpus (14 real redaction entries produced) | Implemented |
| BR-13 | An agent's structured output is validated for grounding, not just shape — a returned chunk id or candidate handle must reference something the agent actually had access to | Every agent (`evidenceExtractor`, `rubricScorer`, `shortlistDrafter`) scopes its output schema per-call against the real input identifiers before accepting a completion, retrying otherwise (same discipline as `answerQuestion.js`'s citation resolution) | Implemented |
| BR-14 | A screening run drives Run.js's full FSM from INGEST_CONTEXT to AWAIT_APPROVAL for a whole role/candidate pool, gracefully degrading (not failing) when a structured-completion step or a candidate's evidence extraction fails (FR-5) | `runScreeningWorkflow.js`; every transition validated against Run.js's own transition table before being persisted, never an ad hoc state write; a forced-failure test actually reaches DEGRADED_DRAFT (not just asserts the branch exists); verified live against a real 4-candidate backend-engineer pool (2 genuinely OCR-blocked), reaching DEGRADED_DRAFT correctly — a 9-candidate live attempt crashed Ollama's model runner under sustained load, a disclosed infra limit (`docs/SYSTEM-DESIGN.md` gap table), not a code defect | Implemented |
| BR-15 | A human decision on an AWAIT_APPROVAL run finalizes the shortlist or rejects it; no write tool executes without a genuine backing approval (FR-4/FR-5's approval gate, second demoable slice) | `applyApprovalDecision.js` + `finalizeShortlist.js`; the gate lives in the tool itself (`ApprovalRequiredError` if the approval record doesn't exist, doesn't match, or wasn't an approving decision), not only in the calling use case's flow control; `npm run screen -- decide` verified against the live database for both a real approve-then-finalize round trip and a real reject round trip | Implemented |

_Further BR entries added in the same PR as each subsequent phase lands._

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

| BR | Status | Evidence |
|---|---|---|
| BR-01 | Implemented | `src/adapters/extraction/{Txt,Docx,Pdf}Extractor.js`; `tests/integration/extraction.test.js` |
| BR-02 | Implemented | `src/adapters/extraction/PdfExtractor.js` (`MIN_CHARS_PER_PAGE`); verified against real scanned CVs in PR #24/#28 |
| BR-03 | Implemented | `src/application/ingestion/ingestDocument.js`; `tests/integration/ingestDocument.test.js`; real 42-doc corpus re-run in <1s (PR #28) |
| BR-04 | Implemented | `VectorStorePort.getChunkerVersionForDocument`; `ingestDocument.js`; PR #28 |
| BR-05 | Implemented | `ingestDocument.js`'s single try/catch around the full pipeline; `ingestCorpus.js`; PR #28 |
| BR-06 | Implemented | `docs/adr/0001-chunking-and-retrieval-strategy.md`; `src/application/chunking/`; PR #26 |
| BR-07 | Implemented | `src/adapters/vectorstore/PgVectorStore.js` (`hybridSearch`); `tests/integration/repositories.test.js`; PR #23 |
| BR-08 | Implemented | `src/domain/services/decideRefusal.js`; `tests/unit/decideRefusal.test.js`; `docs/adr/0001` |
| BR-09 | Implemented | `src/application/ports/LLMProviderPort.js`; `src/adapters/llm/{OllamaProvider,GeminiProvider,FallbackLLMProvider}.js`; `docs/adr/0005` |
| BR-10 | Implemented | `src/application/use-cases/answerQuestion.js`; `prompts/answer-grounded.md`; `scripts/ask.js`; `tests/unit/answerQuestion.test.js`; PR #32 |
| BR-11 | Implemented | `src/application/agents/{evidenceExtractor,rubricScorer,shortlistDrafter}.js`; `src/application/tools/dispatchTool.js`; `tests/unit/dispatchTool.test.js`; issue #38/#39 |
| BR-12 | Implemented | `src/application/workflows/extractRedactScore.js`; `tests/unit/extractRedactScore.test.js`; `docs/adr/0006`; issue #13 |
| BR-13 | Implemented | Per-call `.refine()` on each agent's output schema in `src/application/agents/*.js`; `tests/unit/{evidenceExtractor,rubricScorer,shortlistDrafter}.test.js` |
| BR-14 | Implemented | `src/application/workflows/runScreeningWorkflow.js`; `tests/unit/runScreeningWorkflow.test.js`; issue #40 |
| BR-15 | Implemented | `src/application/workflows/applyApprovalDecision.js`; `src/application/tools/finalizeShortlist.js`; `scripts/screen.js`; `tests/unit/{applyApprovalDecision,finalizeShortlist}.test.js`; issue #41 |
