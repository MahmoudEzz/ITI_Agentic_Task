// Mirrors Approval.js's APPROVAL_DECISIONS exactly.
const APPROVAL_DECISIONS = ["approved", "rejected", "edited_and_approved"];

export async function up(knex) {
  await knex.schema.createTable("approvals", (table) => {
    table.text("id").primary();
    table.text("run_id").notNullable().references("id").inTable("runs").onDelete("CASCADE");
    table.text("decision").notNullable();
    table.text("decided_by").notNullable();
    table.timestamp("decided_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.jsonb("edit_diff").nullable();
    table.text("comment").nullable();

    table.index(["run_id"]);
  });
  await knex.raw(
    `ALTER TABLE approvals ADD CONSTRAINT approvals_decision_check CHECK (decision IN (${APPROVAL_DECISIONS.map((d) => `'${d}'`).join(", ")}))`,
  );
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("approvals");
}
