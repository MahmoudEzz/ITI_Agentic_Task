// nomic-embed-text (the configured OLLAMA_EMBED_MODEL) produces 768-dimensional
// embeddings — see .env.example / ADR-0005. If the embedding model ever
// changes, this dimension and the ivfflat/hnsw index below change together.
const EMBEDDING_DIMENSIONS = 768;

export async function up(knex) {
  await knex.schema.createTable("chunks", (table) => {
    table.text("id").primary();
    table.text("document_id").notNullable().references("id").inTable("documents").onDelete("CASCADE");
    table.text("content").notNullable();
    table.text("section").nullable();
    table.integer("page").nullable();
    table.integer("char_start").nullable();
    table.integer("char_end").nullable();
    table.text("candidate_id").nullable().references("id").inTable("candidates").onDelete("CASCADE");
    table.text("document_type").notNullable(); // denormalized from documents.type for retrieval filtering (ADR-0001)
    table.integer("version").notNullable().defaultTo(1);
    table.text("chunker_version").notNullable();
    table.text("ocr_version").nullable();
    table.decimal("ocr_confidence", 5, 2).nullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["document_id"]);
    table.index(["candidate_id"]);
    table.index(["document_type"]);
  });

  // vector column + full-text tsvector are added via raw SQL — knex's schema
  // builder has no first-class support for either.
  await knex.raw(`ALTER TABLE chunks ADD COLUMN embedding vector(${EMBEDDING_DIMENSIONS})`);
  await knex.raw(`
    ALTER TABLE chunks ADD COLUMN content_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
  `);

  // HNSW for dense retrieval (cosine distance, matching the provider's
  // similarity convention) — see ADR-0003. GIN for the keyword half of the
  // hybrid fusion — see ADR-0001.
  await knex.raw("CREATE INDEX chunks_embedding_hnsw_idx ON chunks USING hnsw (embedding vector_cosine_ops)");
  await knex.raw("CREATE INDEX chunks_content_tsv_idx ON chunks USING GIN (content_tsv)");
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("chunks");
}
