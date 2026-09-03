# ADR-0002: Orchestration pattern

## Status

Proposed (implemented in Phase 4; flip to Accepted once landed and tested)

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

## Consequences

- Every run's state transitions are persisted (`runs`, `run_steps` tables), giving exact step-by-step inspectability by run ID — this was a design goal, not an afterthought.
- Because the pattern is fixed-sequence, adding a genuinely dynamic step later (e.g. an agent that decides whether to re-query for more evidence) would require deliberately introducing a supervisor sub-pattern for that one step, not retrofitting the whole pipeline.
- The `DEGRADED_DRAFT` state is the concrete mechanism satisfying FR-5's "graceful degradation to plain RAG" requirement at the orchestrator level, not just as a Q&A-endpoint fallback.
