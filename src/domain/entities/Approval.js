import { ValidationError } from "../errors/index.js";

export const APPROVAL_DECISIONS = Object.freeze(["approved", "rejected", "edited_and_approved"]);

export function createApproval({ id, runId, decision, decidedBy, decidedAt = new Date(), editDiff = null, comment = null }) {
  if (!id) throw new ValidationError("Approval requires an id");
  if (!runId) throw new ValidationError("Approval requires a runId");
  if (!APPROVAL_DECISIONS.includes(decision)) {
    throw new ValidationError(`Approval decision must be one of ${APPROVAL_DECISIONS.join(", ")} (got "${decision}")`);
  }
  if (!decidedBy) throw new ValidationError("Approval requires decidedBy — an unattributed approval is not auditable");
  if (decision === "edited_and_approved" && !editDiff) {
    throw new ValidationError('An "edited_and_approved" decision requires an editDiff to audit what changed');
  }

  return Object.freeze({ id, runId, decision, decidedBy, decidedAt, editDiff, comment });
}
