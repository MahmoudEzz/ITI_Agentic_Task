import { redactEvidenceSnippets } from "../../domain/services/redactProtectedAttributes.js";
import { InsufficientEvidenceError, NotFoundError } from "../../domain/errors/index.js";

// The EXTRACT_EVIDENCE -> REDACT_PROTECTED_ATTRS -> SCORE_RUBRIC slice of
// the pipeline (Run.js/ADR-0002) — the full FSM (all states, persistence,
// DEGRADED_DRAFT) lands with the orchestrator (issue #40); this closes
// issue #13 specifically: redactEvidenceSnippets is unit-tested in
// isolation since Phase 1, but nothing bound it to the actual pipeline
// until now. Every evidence snippet is redacted here, for real, before it
// can reach RubricScorerInputSchema — never skippable by construction,
// since this function is the only path from raw extraction to scoring.
function buildRubricCriteriaText(competency) {
  const anchors = Object.entries(competency.behavioralAnchors)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([level, text]) => `Level ${level}: ${text}`)
    .join("\n");
  return `${competency.description}\n${anchors}`;
}

export function createExtractRedactScoreWorkflow({ evidenceExtractor, rubricScorer, rubricRepository, competencyRepository }) {
  return async function extractRedactScore({ candidateHandle, rubricId }) {
    const rubric = await rubricRepository.findById(rubricId);
    if (!rubric) throw new NotFoundError("Rubric", rubricId);

    const competencyIds = rubric.competencyWeights.map((w) => w.competencyId);
    const competencies = await Promise.all(competencyIds.map((id) => competencyRepository.findById(id)));
    const competencyById = new Map(competencies.map((c) => [c.id, c]));

    const evidenceOutput = await evidenceExtractor({ candidateHandle, competencyIds });

    const auditEntries = [];
    const evidenceByCompetency = [];
    for (const entry of evidenceOutput.evidenceByCompetency) {
      const { snippets, auditEntries: entryAudit } = redactEvidenceSnippets(entry.snippets);
      auditEntries.push(...entryAudit);
      // A competency whose entire evidence was dropped by redaction (every
      // snippet exceeded the drop-ratio threshold) cannot be scored — it is
      // simply absent from what reaches the Rubric Scorer, not padded with
      // an empty/fabricated entry.
      if (snippets.length === 0) continue;
      evidenceByCompetency.push({
        competencyId: entry.competencyId,
        evidenceSnippets: snippets,
        rubricCriteria: buildRubricCriteriaText(competencyById.get(entry.competencyId)),
      });
    }

    const scoredCompetencyIds = new Set(evidenceByCompetency.map((e) => e.competencyId));
    const missingCompetencyIds = competencyIds.filter((id) => !scoredCompetencyIds.has(id));
    if (missingCompetencyIds.length > 0) {
      // Score.js's compositeScore() requires every rubric-weighted
      // competency to have a score, by design (a missing competency would
      // silently change what the composite represents) — so a gap here is
      // a correct refusal at this stage, not a bug to paper over. The
      // orchestrator (issue #40) is what decides whether this becomes a
      // DEGRADED_DRAFT run rather than a hard failure.
      throw new InsufficientEvidenceError(
        `No usable evidence for candidate ${candidateHandle} on: ${missingCompetencyIds.join(", ")} (extraction found none, or redaction dropped it entirely)`,
      );
    }

    const scorerOutput = await rubricScorer({ candidateHandle, rubricId, evidenceByCompetency });

    return { scores: scorerOutput.scores, auditEntries };
  };
}
