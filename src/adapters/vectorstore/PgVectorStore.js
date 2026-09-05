import { toSql } from "pgvector";
import { VectorStorePort } from "../../application/ports/VectorStorePort.js";

// Reciprocal Rank Fusion, k=60 — see ADR-0001. Combining on rank position
// avoids the cross-scale-score normalization problem of mixing cosine
// similarity and ts_rank_cd directly.
const RRF_K = 60;

function rowToChunkResult(row, score) {
  return {
    chunkId: row.id,
    documentId: row.document_id,
    content: row.content,
    score,
    section: row.section ?? null,
    page: row.page ?? null,
    ocrConfidence: row.ocr_confidence !== null && row.ocr_confidence !== undefined ? Number(row.ocr_confidence) : null,
  };
}

export class PgVectorStore extends VectorStorePort {
  #knex;

  constructor(knex) {
    super();
    this.#knex = knex;
  }

  async insertChunks(chunks) {
    if (chunks.length === 0) return;

    // Inserted in one transaction: either the whole document's chunk set
    // lands, or none of it does — a half-indexed document is worse than an
    // unindexed one (it would return incomplete, misleadingly-confident
    // retrieval results).
    await this.#knex.transaction(async (trx) => {
      for (const chunk of chunks) {
        await trx("chunks").insert({
          id: chunk.id,
          document_id: chunk.documentId,
          content: chunk.content,
          section: chunk.section ?? null,
          page: chunk.page ?? null,
          char_start: chunk.charRange?.start ?? null,
          char_end: chunk.charRange?.end ?? null,
          candidate_id: chunk.candidateId ?? null,
          document_type: chunk.documentType,
          version: chunk.version ?? 1,
          chunker_version: chunk.chunkerVersion,
          ocr_version: chunk.ocrVersion ?? null,
          ocr_confidence: chunk.ocrConfidence ?? null,
          embedding: trx.raw("?::vector", [toSql(chunk.embedding)]),
        });
      }
    });
  }

  async deleteChunksByDocumentId(documentId) {
    await this.#knex("chunks").where({ document_id: documentId }).delete();
  }

  async searchByEmbedding(embedding, { topK = 8, documentType, candidateId } = {}) {
    let query = this.#knex("chunks")
      .select("*")
      .select(this.#knex.raw("1 - (embedding <=> ?::vector) AS similarity", [toSql(embedding)]))
      .whereNotNull("embedding")
      .orderByRaw("embedding <=> ?::vector", [toSql(embedding)])
      .limit(topK);

    if (documentType) query = query.andWhere({ document_type: documentType });
    if (candidateId) query = query.andWhere({ candidate_id: candidateId });

    const rows = await query;
    return rows.map((row) => rowToChunkResult(row, Number(row.similarity)));
  }

  async searchByKeyword(queryText, { topK = 8, documentType, candidateId } = {}) {
    let query = this.#knex("chunks")
      .select("*")
      .select(this.#knex.raw("ts_rank_cd(content_tsv, websearch_to_tsquery('english', ?)) AS rank", [queryText]))
      .whereRaw("content_tsv @@ websearch_to_tsquery('english', ?)", [queryText])
      .orderBy("rank", "desc")
      .limit(topK);

    if (documentType) query = query.andWhere({ document_type: documentType });
    if (candidateId) query = query.andWhere({ candidate_id: candidateId });

    const rows = await query;
    return rows.map((row) => rowToChunkResult(row, Number(row.rank)));
  }

  // Hybrid retrieval fusion (ADR-0001): fuse two independently-ranked result
  // sets by reciprocal rank, not by combining raw scores. The fused
  // `rrfScore` becomes `score` on the output — a rank-position artifact, not
  // a confidence magnitude. `denseSimilarity` (raw cosine, from the dense
  // pass only) is carried through separately so a refusal decision has an
  // interpretable 0-1 number to threshold on instead.
  async hybridSearch(queryText, embedding, options = {}) {
    const [denseResults, keywordResults] = await Promise.all([
      this.searchByEmbedding(embedding, options),
      this.searchByKeyword(queryText, options),
    ]);

    const fused = new Map();
    denseResults.forEach((result, rank) => {
      fused.set(result.chunkId, { result, rrfScore: 1 / (RRF_K + rank + 1), denseSimilarity: result.score });
    });
    keywordResults.forEach((result, rank) => {
      const existing = fused.get(result.chunkId);
      const rrfContribution = 1 / (RRF_K + rank + 1);
      if (existing) {
        existing.rrfScore += rrfContribution;
      } else {
        fused.set(result.chunkId, { result, rrfScore: rrfContribution, denseSimilarity: null });
      }
    });

    return [...fused.values()]
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, options.topK ?? 8)
      .map(({ result, rrfScore, denseSimilarity }) => ({ ...result, score: rrfScore, denseSimilarity }));
  }

  async findByCandidateId(candidateId, { section } = {}) {
    let query = this.#knex("chunks").select("*").where({ candidate_id: candidateId });
    if (section) query = query.andWhere({ section });
    const rows = await query;
    return rows.map((row) => rowToChunkResult(row, null));
  }

  async getChunkerVersionForDocument(documentId) {
    const row = await this.#knex("chunks").select("chunker_version").where({ document_id: documentId }).first();
    return row?.chunker_version ?? null;
  }
}
