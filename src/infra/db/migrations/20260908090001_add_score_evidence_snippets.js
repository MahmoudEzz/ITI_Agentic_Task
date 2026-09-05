// Closes the disclosed residual gap in docs/SECURITY.md: the generated
// report's citation column previously resolved an evidenceChunkId to only
// its document/page, never the actual quoted evidence text — a hiring
// manager had to open the source document to notice, e.g., that a whole
// cited page was one contact-info line. The snippet text itself is already
// real/grounded by the time it reaches here (Evidence Extractor's
// containment check, ADR-0006), so this is a display improvement, not a
// new trust boundary.
export async function up(knex) {
  await knex.schema.alterTable("scores", (table) => {
    table.jsonb("evidence_snippets").nullable(); // [{ sourceChunkId, text }] — null for a pre-existing row scored before this column existed
  });
}

export async function down(knex) {
  await knex.schema.alterTable("scores", (table) => {
    table.dropColumn("evidence_snippets");
  });
}
