// finalize_shortlist (the write tool gated by the approval — see
// src/application/tools/finalizeShortlist.js) updates the same row
// DRAFT_SHORTLIST/DEGRADED_DRAFT already created (one shortlist per run),
// recording which approval authorized it and when — rather than a second
// table, since a run has at most one finalization event.
export async function up(knex) {
  await knex.schema.alterTable("shortlists", (table) => {
    table.text("approval_id").nullable().references("id").inTable("approvals");
    table.timestamp("finalized_at", { useTz: true }).nullable();
  });
}

export async function down(knex) {
  await knex.schema.alterTable("shortlists", (table) => {
    table.dropColumn("approval_id");
    table.dropColumn("finalized_at");
  });
}
