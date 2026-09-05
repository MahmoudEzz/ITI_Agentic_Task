import { transition } from "../../domain/entities/Run.js";
import { createApproval } from "../../domain/entities/Approval.js";
import { NotFoundError, ValidationError } from "../../domain/errors/index.js";

// Reconstructs just enough of Run.js's domain shape to validate a
// transition through the single source of truth (Run.js's own table) —
// RunRepositoryPort.findById returns a plain row with no in-memory
// `history` array (that lives in run_steps), so a single-entry history
// stands in for it. transition() only ever reads run.state and appends
// one entry; it never inspects earlier history, so this is a faithful
// enough reconstruction for a legality check, not a full replay.
function toDomainRun(runRow) {
  return { ...runRow, history: [{ state: runRow.state, at: runRow.updatedAt ?? new Date() }] };
}

// Human decision on an AWAIT_APPROVAL run (FR-4/FR-5's approval gate,
// second demoable slice, issue #41). `approved` and `edited_and_approved`
// both finalize the shortlist (via the real finalize_shortlist write
// tool — this use case is not itself the gate, the tool is) and advance
// to GENERATE_REPORT, which stays legitimately non-terminal
// (Run.js's isTerminal()) until Phase 5 adds the step that completes it.
// `rejected` moves straight to the terminal REJECTED state and finalizes
// nothing.
export function createApplyApprovalDecisionUseCase({ runRepository, approvalRepository, shortlistRepository, finalizeShortlist }) {
  return async function applyApprovalDecision({ runId, decision, decidedBy, editDiff = null, comment = null, finalShortlist = null }) {
    const runRow = await runRepository.findById(runId);
    if (!runRow) throw new NotFoundError("Run", runId);
    if (runRow.state !== "AWAIT_APPROVAL") {
      throw new ValidationError(`Run ${runId} is in state ${runRow.state}, not AWAIT_APPROVAL — no approval decision can be applied now`);
    }

    const approval = createApproval({ id: crypto.randomUUID(), runId, decision, decidedBy, editDiff, comment });
    await approvalRepository.create(approval);

    if (decision === "rejected") {
      transition(toDomainRun(runRow), "REJECTED"); // validates legality before persisting
      await runRepository.transitionTo(runId, "REJECTED", { note: comment });
      return { approval, finalized: null };
    }

    // approved | edited_and_approved: default to the drafted shortlist's
    // own ranking unchanged when the caller doesn't supply an explicit
    // edit — a plain "approved" decision shouldn't require re-stating the
    // whole ranking just to finalize it as-is.
    let shortlistForFinalization = finalShortlist;
    if (!shortlistForFinalization) {
      const drafted = await shortlistRepository.findByRunId(runId);
      if (!drafted) throw new NotFoundError("Shortlist", runId);
      shortlistForFinalization = drafted.entries.map((e) => ({ candidateHandle: e.candidateHandle, rank: e.rank }));
    }

    const finalized = await finalizeShortlist({ runId, approvalId: approval.id, shortlist: shortlistForFinalization });

    transition(toDomainRun(runRow), "GENERATE_REPORT");
    await runRepository.transitionTo(runId, "GENERATE_REPORT");

    return { approval, finalized };
  };
}
