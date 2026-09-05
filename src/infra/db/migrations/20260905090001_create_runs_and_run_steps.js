// Mirrors Run.js's RUN_STATES exactly (docs/adr/0002) — this CHECK
// constraint and that table change together, in the same PR, same as the
// documents/chunks status enums already do.
const RUN_STATES = [
  "INGEST_CONTEXT",
  "EXTRACT_EVIDENCE",
  "REDACT_PROTECTED_ATTRS",
  "SCORE_RUBRIC",
  "DRAFT_SHORTLIST",
  "DEGRADED_DRAFT",
  "AWAIT_APPROVAL",
  "GENERATE_REPORT",
  "COMPLETE",
  "REJECTED",
  "FAILED",
];

export async function up(knex) {
  await knex.schema.createTable("runs", (table) => {
    table.text("id").primary();
    table.text("workflow_type").notNullable();
    table.text("state").notNullable();
    table.text("created_by").notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["created_by"]);
    table.index(["state"]);
  });
  await knex.raw(`ALTER TABLE runs ADD CONSTRAINT runs_state_check CHECK (state IN (${RUN_STATES.map((s) => `'${s}'`).join(", ")}))`);

  // Step-by-step run inspection by run id (the brief's own requirement) —
  // one row per state Run.js's history actually recorded, so this table IS
  // the persisted form of Run.js's in-memory `history` array, not a
  // duplicate of it.
  await knex.schema.createTable("run_steps", (table) => {
    table.text("id").primary();
    table.text("run_id").notNullable().references("id").inTable("runs").onDelete("CASCADE");
    table.text("state").notNullable();
    table.text("note").nullable(); // e.g. a DEGRADED_DRAFT reason or a FAILED error message
    table.timestamp("entered_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["run_id"]);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("run_steps");
  await knex.schema.dropTableIfExists("runs");
}
