import { NotFoundError, ValidationError } from "../../domain/errors/index.js";
import { compositeScore } from "../../domain/entities/Score.js";

// One report-content model shared by both renderers (docx and pdf) — see
// ADR-0004. Resolves everything a report needs to render (candidates in
// rank order, their scores against the rubric, and citations resolved from
// raw chunk ids to readable document/page references) so a renderer never
// touches a repository or the vector store itself.
export function createBuildReportContentUseCase({ runRepository, shortlistRepository, scoreRepository, competencyRepository, rubricRepository, vectorStore }) {
  return async function buildReportContent(runId) {
    const run = await runRepository.findById(runId);
    if (!run) throw new NotFoundError("Run", runId);

    const shortlist = await shortlistRepository.findByRunId(runId);
    if (!shortlist) throw new NotFoundError("Shortlist", runId);
    if (!shortlist.finalizedAt) {
      throw new ValidationError(`Shortlist for run ${runId} is not finalized yet — generate_report requires a finalized shortlist`);
    }

    const rubric = await rubricRepository.findByRoleId(shortlist.roleId);
    if (!rubric) throw new NotFoundError("Rubric", shortlist.roleId);

    const competencyById = new Map();
    for (const { competencyId } of rubric.competencyWeights) {
      const competency = await competencyRepository.findById(competencyId);
      if (competency) competencyById.set(competencyId, competency);
    }

    const allChunkIds = new Set();
    const candidates = [];
    for (const entry of shortlist.entries) {
      const scores = await scoreRepository.findByRunAndCandidate(runId, entry.candidateHandle);
      for (const score of scores) {
        for (const chunkId of score.evidenceChunkIds) allChunkIds.add(chunkId);
      }
      candidates.push({
        candidateHandle: entry.candidateHandle,
        rank: entry.rank,
        summary: entry.summary,
        interviewProbes: entry.interviewProbes,
        scores,
        // DEGRADED_DRAFT candidates never went through the Rubric Scorer at
        // all (empty scores, not partial) — compositeScore() would throw if
        // called with a partial set, so it's only ever called with the
        // complete set or not at all.
        compositeScore: scores.length > 0 ? compositeScore(scores, rubric) : null,
      });
    }
    candidates.sort((a, b) => a.rank - b.rank);

    const citationRows = await vectorStore.findByIds([...allChunkIds]);
    const citationsByChunkId = new Map(citationRows.map((c) => [c.chunkId, c]));

    return {
      run: { id: run.id, workflowType: run.workflowType, createdBy: run.createdBy },
      roleId: shortlist.roleId,
      degraded: shortlist.degraded,
      finalizedAt: shortlist.finalizedAt,
      competencies: [...competencyById.values()],
      candidates,
      citationsByChunkId,
    };
  };
}
