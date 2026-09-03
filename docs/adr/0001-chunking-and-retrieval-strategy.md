# ADR-0001: Chunking and retrieval strategy

## Status

Proposed (implemented in Phase 2-3; flip to Accepted once landed and tested against the golden set)

## Context

The corpus is structurally irregular: CVs vary wildly in section naming/ordering, job descriptions and rubrics are more uniform, and policy documents are long-form prose. A single fixed-size chunker would either fragment coherent CV experience entries or under-chunk long policy documents. Retrieval must also support the D6-specific need to scope a query to one candidate's evidence for one competency, not just "most similar text anywhere."

## Decision

**Structure-aware chunking**: detect section headers (Experience, Education, Skills, Summary, Certifications) via heading heuristics; within Experience, chunk per job entry, bounded by company/date-pattern detection; fall back to a recursive token-based chunker (~400 tokens, 15% overlap, counted via `js-tiktoken`) for documents without detectable structure (plain-text rubrics/policies). Every chunk carries `documentId, documentType, candidateId, section, page, charRange, version, chunkerVersion, ocrVersion, ocrConfidence`.

**Hybrid retrieval**: dense (pgvector cosine similarity) + keyword (Postgres full-text search, `ts_rank_cd` over a GIN index), fused via **Reciprocal Rank Fusion (k=60)**.

**The one required enhancement**: **metadata filtering** by `candidateId` / `section` / `documentType` — retrieval for "does candidate X show evidence of competency Y" is restricted to candidate X's own chunks and relevant sections, rather than relying on semantic similarity alone to avoid cross-candidate contamination.

## Alternatives considered

- **Fixed-size chunking only** — simpler, but tested against this corpus's structure it would split a single job's bullet points across chunks arbitrarily, weakening evidence citations for a specific role/period. Rejected.
- **Re-ranking (cross-encoder) as the enhancement** — genuinely useful, but adds a second model call per query on a CPU-bound local Ollama setup, hurting the demo's responsiveness for uncertain accuracy gain at this corpus size. Deferred, noted in `docs/SYSTEM-DESIGN.md` gap table as a stretch enhancement.
- **RRF vs. weighted score fusion** — weighted fusion requires normalizing dense cosine scores against BM25/ts_rank scores on different scales, which is fragile and harder to justify/test. RRF avoids this by fusing on rank position alone.

## Consequences

- Chunk metadata carries `chunkerVersion`/`ocrVersion` so a future chunking-logic change forces re-chunking under idempotent re-ingestion rather than silently leaving stale chunks in the index.
- Structure-aware chunking is more code to test than a fixed-size splitter; unit tests must cover both the structured and fallback paths independently.
- Metadata filtering means a badly-tagged `candidateId` on ingestion silently narrows retrieval to nothing — ingestion must reject documents it cannot confidently attribute to a candidate rather than index them with a null/guessed ID.
