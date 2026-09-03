import { ValidationError } from "../errors/index.js";

// Mirrors docs/adr/0002-orchestration-pattern.md exactly — this table IS the
// orchestration pattern's contract. If a phase needs a new transition, the
// ADR and this table change together, in the same PR.
const TRANSITIONS = Object.freeze({
  INGEST_CONTEXT: ["EXTRACT_EVIDENCE", "FAILED"],
  EXTRACT_EVIDENCE: ["REDACT_PROTECTED_ATTRS", "DEGRADED_DRAFT", "FAILED"],
  REDACT_PROTECTED_ATTRS: ["SCORE_RUBRIC", "FAILED"],
  SCORE_RUBRIC: ["DRAFT_SHORTLIST", "DEGRADED_DRAFT", "FAILED"],
  DRAFT_SHORTLIST: ["AWAIT_APPROVAL", "DEGRADED_DRAFT", "FAILED"],
  DEGRADED_DRAFT: ["AWAIT_APPROVAL", "FAILED"],
  AWAIT_APPROVAL: ["GENERATE_REPORT", "REJECTED"],
  GENERATE_REPORT: ["COMPLETE", "FAILED"],
  COMPLETE: [],
  REJECTED: [],
  FAILED: [],
});

export const RUN_STATES = Object.freeze(Object.keys(TRANSITIONS));

export function createRun({ id, workflowType, createdBy, createdAt = new Date() }) {
  if (!id) throw new ValidationError("Run requires an id");
  if (!workflowType) throw new ValidationError("Run requires a workflowType");
  if (!createdBy) throw new ValidationError("Run requires createdBy (ownership scoping)");

  return Object.freeze({
    id,
    workflowType,
    createdBy,
    createdAt,
    state: "INGEST_CONTEXT",
    history: Object.freeze([{ state: "INGEST_CONTEXT", at: createdAt }]),
  });
}

export function transition(run, nextState, { at = new Date() } = {}) {
  const allowed = TRANSITIONS[run.state];
  if (!allowed) throw new ValidationError(`Unknown run state: ${run.state}`);
  if (!allowed.includes(nextState)) {
    throw new ValidationError(`Illegal run transition: ${run.state} -> ${nextState} (allowed: ${allowed.join(", ") || "none, terminal state"})`);
  }

  return Object.freeze({
    ...run,
    state: nextState,
    history: Object.freeze([...run.history, { state: nextState, at }]),
  });
}

export function isTerminal(run) {
  return TRANSITIONS[run.state].length === 0;
}
