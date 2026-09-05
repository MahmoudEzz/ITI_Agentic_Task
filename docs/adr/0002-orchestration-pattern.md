# ADR-0002: Orchestration pattern

## Status

Proposed (the FSM through `AWAIT_APPROVAL`, including the `DEGRADED_DRAFT` fallback, has landed and been tested — see Consequences; the approval gate → `GENERATE_REPORT` → `COMPLETE` portion this ADR's diagram also describes lands with issue #41, so Phase 4 as a whole isn't done yet — flip to Accepted once it is)

## Context

D6's workflow is fixed and linear: extract competency evidence → redact protected attributes → score against rubric → draft shortlist → human approval → generate report. There is no need for an agent to dynamically decide what step comes next, or to replan based on intermediate results — the business process order does not change at runtime.

## Decision

**Sequential pipeline**, implemented as a hand-rolled finite state machine in the application layer:

```
INGEST_CONTEXT → EXTRACT_EVIDENCE → REDACT_PROTECTED_ATTRS → SCORE_RUBRIC → DRAFT_SHORTLIST
  → AWAIT_APPROVAL → { APPROVED | EDITED → GENERATE_REPORT | REJECTED → END } → COMPLETE
```

plus a `DEGRADED_DRAFT` state, entered from any structured-output step that exhausts its retries, producing a single-pass plain-RAG shortlist (visibly labeled degraded) that still passes through the same approval gate.

Named as **one** pattern (pipeline), not hedged as "pipeline/state-machine" — the FSM is the *implementation mechanism* of the pipeline, not a second orchestration pattern competing with it.

## Alternatives considered

- **Supervisor pattern** (an LLM decides which agent to invoke next) — rejected: there is nothing to decide here that isn't already determined by the business process; adding a supervisor call would add latency, cost, and a new failure mode (the supervisor mis-routing) with no corresponding benefit.
- **Planner-executor** — rejected for the same reason: the plan is not dynamic, it is the workflow itself. Planning would be redundant work re-deriving a fixed sequence.
- **A general graph/DAG orchestration library (e.g. LangGraph)** — rejected in favor of a hand-rolled FSM so that every transition, retry, and audit log entry is exact and owned code, not framework behavior the candidate has to explain secondhand when teaching this.

**Tool dispatch (Phase 4 addendum):** for the same reason a supervisor is rejected above, *which tool runs at each step* is also decided by the orchestrator's code, never by the LLM choosing to call it — no ReAct-style tool-calling loop, which would be the single most likely thing to make this pipeline unreliable on a local 3B model. What still needs to be real, not just implicit in "the code just doesn't call it," is the *restriction*: each agent declares an `allowedTools` list (`EVIDENCE_EXTRACTOR_ALLOWED_TOOLS = ["get_candidate_chunks"]`; the Rubric Scorer and Shortlist Drafter declare none — they are pure transforms), and `src/application/tools/dispatchTool.js`'s scoped dispatcher rejects (`ToolNotAllowedError`) any call outside that list even if something tries to route it through anyway. This is the mechanism behind the "restricted tool allow-list" half of FR-4, verified by a test asserting the Rubric Scorer's step attempting `search_corpus` is rejected.

## Consequences

- Every run's state transitions are persisted (`runs`, `run_steps` tables), giving exact step-by-step inspectability by run ID — this was a design goal, not an afterthought.
- Because the pattern is fixed-sequence, adding a genuinely dynamic step later (e.g. an agent that decides whether to re-query for more evidence) would require deliberately introducing a supervisor sub-pattern for that one step, not retrofitting the whole pipeline.
- The `DEGRADED_DRAFT` state is the concrete mechanism satisfying FR-5's "graceful degradation to plain RAG" requirement at the orchestrator level, not just as a Q&A-endpoint fallback.
- **Verified (Phase 4, `runScreeningWorkflow.js`):** every transition is validated against `Run.js`'s own transition table before being persisted, so the orchestrator can never write a state that table doesn't allow — including the constraint that `REDACT_PROTECTED_ATTRS` has no legal `DEGRADED_DRAFT` exit, which shaped where in the batch a failure is attributed (see the file's own comments). A forced-failure unit test actually reaches `DEGRADED_DRAFT` via a stub, and a live run against the real corpus and a real local Ollama produced it for real: 2 of 4 candidates were genuinely OCR-blocked (no chunks), the run degraded correctly, and the surviving 2 candidates got a real composite-score-ranked shortlist. The same live run also surfaced Ollama's model runner crashing under sustained load on an earlier, larger batch (see ADR-0005's Consequences) — `FallbackLLMProvider` caught it and fell through to Gemini exactly as designed, itself blocked only on the disclosed missing-API-key gap.
