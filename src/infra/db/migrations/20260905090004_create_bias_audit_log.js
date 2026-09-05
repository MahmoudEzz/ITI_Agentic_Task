// Persists exactly the auditEntries shape redactProtectedAttributes.js
// already returns (src/domain/services/redactProtectedAttributes.js) — see
// docs/adr/0006-bias-safety-design.md. `start`/`end` are the matched span's
// *position* in the source chunk, never the matched text itself, so this
// log never becomes a second copy of the PII it's proving was removed.
export async function up(knex) {
  await knex.schema.createTable("bias_audit_log", (table) => {
    table.text("id").primary();
    table.text("run_id").notNullable().references("id").inTable("runs").onDelete("CASCADE");
    table.text("source_chunk_id").notNullable();
    table.text("category").notNullable(); // one of PROTECTED_ATTRIBUTE_CATEGORIES
    table.text("action").notNullable(); // "redact" | "drop"
    table.integer("span_start").nullable(); // null for a "drop" action (whole snippet discarded)
    table.integer("span_end").nullable();
    table.timestamp("at", { useTz: true }).notNullable();

    table.index(["run_id"]);
  });
  await knex.raw(`ALTER TABLE bias_audit_log ADD CONSTRAINT bias_audit_log_action_check CHECK (action IN ('redact', 'drop'))`);
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("bias_audit_log");
}
