export async function up(knex) {
  await knex.schema.createTable("candidates", (table) => {
    table.text("id").primary();
    table.text("handle").notNullable().unique(); // opaque CAND-N handle, see Candidate.js
    table.text("full_name").notNullable();
    table.text("created_by").notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("candidates");
}
