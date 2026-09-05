import { FinalizeShortlistInputSchema, FinalizeShortlistOutputSchema } from "../../contracts/tools.js";
import { ApprovalRequiredError, NotFoundError, ValidationError } from "../../domain/errors/index.js";

// The write/side-effecting tool gate lives HERE, not only in the calling
// use case's control flow — even a caller that skips
// applyApprovalDecision.js and invokes this tool directly still cannot
// finalize without a genuine backing Approval record whose decision is
// approved/edited_and_approved. This is what "no destructive/write tool
// without the approval gate" (docs/SECURITY.md) actually means as a
// mechanism, not just a flow-control convention.
const APPROVING_DECISIONS = new Set(["approved", "edited_and_approved"]);

export function createFinalizeShortlistTool({ approvalRepository, shortlistRepository }) {
  return async function finalizeShortlist(rawInput) {
    const input = FinalizeShortlistInputSchema.parse(rawInput);

    const approval = await approvalRepository.findByRunId(input.runId);
    if (!approval || approval.id !== input.approvalId || !APPROVING_DECISIONS.has(approval.decision)) {
      throw new ApprovalRequiredError("finalize_shortlist");
    }

    const existing = await shortlistRepository.findByRunId(input.runId);
    if (!existing) throw new NotFoundError("Shortlist", input.runId);

    // Every finalized candidateHandle must already be in the drafted
    // shortlist — a hiring manager can reorder or drop candidates, never
    // introduce one the pipeline never scored. Rationale/interviewProbes
    // carry over unchanged; only rank is what "edited" actually means here.
    const draftedByHandle = new Map(existing.entries.map((e) => [e.candidateHandle, e]));
    const finalizedEntries = input.shortlist.map(({ candidateHandle, rank }) => {
      const drafted = draftedByHandle.get(candidateHandle);
      if (!drafted) {
        throw new ValidationError(`finalize_shortlist references candidateHandle ${candidateHandle}, which is not in the drafted shortlist for run ${input.runId}`);
      }
      return { ...drafted, rank };
    });

    const finalizedAt = new Date();
    const updated = await shortlistRepository.finalize(existing.id, { approvalId: input.approvalId, entries: finalizedEntries, finalizedAt });

    return FinalizeShortlistOutputSchema.parse({ shortlistId: updated.id, finalizedAt: finalizedAt.toISOString() });
  };
}
