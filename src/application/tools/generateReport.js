import { GenerateReportInputSchema, GenerateReportOutputSchema } from "../../contracts/tools.js";
import { ApprovalRequiredError } from "../../domain/errors/index.js";

// Same approval-gate pattern as finalizeShortlist.js: the gate lives HERE,
// in the write tool itself, not only in whatever workflow calls it — a
// caller that invokes generate_report directly still cannot produce a
// report without a genuine backing approved/edited_and_approved Approval.
const APPROVING_DECISIONS = new Set(["approved", "edited_and_approved"]);

export function createGenerateReportTool({ approvalRepository, reportAssetRepository, buildReportContent, documentGenerator }) {
  return async function generateReport(rawInput) {
    const input = GenerateReportInputSchema.parse(rawInput);

    const approval = await approvalRepository.findByRunId(input.runId);
    if (!approval || approval.id !== input.approvalId || !APPROVING_DECISIONS.has(approval.decision)) {
      throw new ApprovalRequiredError("generate_report");
    }

    // buildReportContent itself throws if the shortlist isn't finalized yet —
    // an approval existing is necessary but not sufficient (finalize_shortlist
    // must have actually run first).
    const reportContent = await buildReportContent(input.runId);
    const content = await documentGenerator.generate(input.format, reportContent);

    const generatedAt = new Date();
    const asset = await reportAssetRepository.create({
      id: crypto.randomUUID(),
      runId: input.runId,
      approvalId: input.approvalId,
      format: input.format,
      content,
      generatedAt,
    });

    return GenerateReportOutputSchema.parse({ assetId: asset.id, format: input.format, generatedAt: generatedAt.toISOString() });
  };
}
