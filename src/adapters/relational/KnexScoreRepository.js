import { ScoreRepositoryPort } from "../../application/ports/ScoreRepositoryPort.js";

function rowToScore(row) {
  return {
    candidateHandle: row.candidate_handle,
    competencyId: row.competency_id,
    value: Number(row.value),
    rationale: row.rationale,
    evidenceChunkIds: row.evidence_chunk_ids,
  };
}

export class KnexScoreRepository extends ScoreRepositoryPort {
  #knex;

  constructor(knex) {
    super();
    this.#knex = knex;
  }

  async createMany(runId, scores) {
    if (scores.length === 0) return;
    await this.#knex("scores").insert(
      scores.map((score) => ({
        id: crypto.randomUUID(),
        run_id: runId,
        candidate_handle: score.candidateHandle,
        competency_id: score.competencyId,
        value: score.value,
        rationale: score.rationale,
        evidence_chunk_ids: JSON.stringify(score.evidenceChunkIds),
      })),
    );
  }

  async findByRunAndCandidate(runId, candidateHandle) {
    const rows = await this.#knex("scores").where({ run_id: runId, candidate_handle: candidateHandle });
    return rows.map(rowToScore);
  }
}
