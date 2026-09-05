// generate_report (the write tool gated by the approval — see
// src/application/tools/generateReport.js) stores its output here rather
// than on the filesystem: one datastore for everything (same rationale as
// ADR-0003's vector-store choice), no volume/object-storage wiring needed
// for an assessment deployment, and a report row is naturally scoped to the
// run + approval that authorized it.
const REPORT_FORMATS = ["docx", "pdf"];

export async function up(knex) {
  await knex.schema.createTable("report_assets", (table) => {
    table.text("id").primary();
    table.text("run_id").notNullable().references("id").inTable("runs").onDelete("CASCADE");
    table.text("approval_id").notNullable().references("id").inTable("approvals");
    table.text("format").notNullable();
    table.binary("content").notNullable();
    table.timestamp("generated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["run_id"]);
  });
  await knex.raw(
    `ALTER TABLE report_assets ADD CONSTRAINT report_assets_format_check CHECK (format IN (${REPORT_FORMATS.map((f) => `'${f}'`).join(", ")}))`,
  );
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("report_assets");
}
