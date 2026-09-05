import { transition } from "../../domain/entities/Run.js";
import { NotFoundError, ValidationError } from "../../domain/errors/index.js";

// Reconstructs just enough of Run.js's domain shape to validate a
// transition — same technique as applyApprovalDecision.js's toDomainRun,
// for the same reason (RunRepositoryPort.findById returns a plain row, not
// an in-memory history array).
function toDomainRun(runRow) {
  return { ...runRow, history: [{ state: runRow.state, at: runRow.updatedAt ?? new Date() }] };
}

// The GENERATE_REPORT -> COMPLETE transition Phase 4 deliberately left
// unwired (see applyApprovalDecision.js's own comment) — this is what
// finally makes Run.js's isTerminal() reachable via COMPLETE, not only via
// REJECTED/FAILED. Requires a run already in GENERATE_REPORT (i.e. already
// approved and finalized — see applyApprovalDecision.js), and the same real
// backing Approval that got it there; generate_report's own approval gate
// re-validates that independently, this use case is not itself the gate.
export function createCompleteRunUseCase({ runRepository, approvalRepository, generateReport }) {
  return async function completeRun({ runId, format }) {
    const runRow = await runRepository.findById(runId);
    if (!runRow) throw new NotFoundError("Run", runId);
    if (runRow.state !== "GENERATE_REPORT") {
      throw new ValidationError(`Run ${runId} is in state ${runRow.state}, not GENERATE_REPORT — no report can be generated now`);
    }

    const approval = await approvalRepository.findByRunId(runId);
    if (!approval) throw new NotFoundError("Approval", runId);

    const asset = await generateReport({ runId, approvalId: approval.id, format });

    transition(toDomainRun(runRow), "COMPLETE"); // validates legality before persisting
    await runRepository.transitionTo(runId, "COMPLETE");

    return { asset };
  };
}
