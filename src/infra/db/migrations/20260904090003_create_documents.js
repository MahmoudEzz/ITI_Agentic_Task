const DOCUMENT_TYPES = ["job_description", "competency_framework", "rubric", "cv", "policy", "process_guide"];
const DOCUMENT_STATUSES = ["pending", "processing", "indexed", "needs_ocr", "failed"];

export async function up(knex) {
  await knex.schema.createTable("documents", (table) => {
    table.text("id").primary();
    table.text("type").notNullable();
    table.text("title").notNullable();
    table.text("source_format").notNullable();
    table.integer("version").notNullable().defaultTo(1);
    table.text("created_by").notNullable();
    table.text("candidate_id").nullable().references("id").inTable("candidates").onDelete("CASCADE");
    table.text("source_path").notNullable();
    table.text("content_hash").notNullable(); // drives idempotent re-ingestion — see the ingestion use case
    table.text("status").notNullable().defaultTo("pending");
    table.text("status_message").nullable();
    table.boolean("ocr_required").notNullable().defaultTo(false);
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["content_hash"]);
    table.index(["status"]);
    table.index(["candidate_id"]);
  });

  await knex.raw(
    `ALTER TABLE documents ADD CONSTRAINT documents_type_check CHECK (type IN (${DOCUMENT_TYPES.map((t) => `'${t}'`).join(", ")}))`,
  );
  await knex.raw(
    `ALTER TABLE documents ADD CONSTRAINT documents_status_check CHECK (status IN (${DOCUMENT_STATUSES.map((s) => `'${s}'`).join(", ")}))`,
  );
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("documents");
}
