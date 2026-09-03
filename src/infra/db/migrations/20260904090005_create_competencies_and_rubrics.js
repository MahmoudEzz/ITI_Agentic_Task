export async function up(knex) {
  await knex.schema.createTable("competencies", (table) => {
    table.text("id").primary();
    table.text("name").notNullable();
    table.text("description").notNullable();
    table.jsonb("behavioral_anchors").notNullable(); // { "1": "...", ..., "5": "..." } — see Competency.js
    table.integer("scale_min").notNullable();
    table.integer("scale_max").notNullable();
  });

  // competency_weights stored as jsonb ([{competencyId, weight}]) rather than
  // a normalized junction table — an expedient choice for the MVP's scale
  // (a handful of rubrics, never queried by weight independently of their
  // rubric). Documented here and in docs/SYSTEM-DESIGN.md rather than left
  // implicit; Rubric.js's own invariant (weights sum to 1) is what actually
  // guards this data's integrity, not a DB constraint.
  await knex.schema.createTable("rubrics", (table) => {
    table.text("id").primary();
    table.text("role_id").notNullable();
    table.jsonb("competency_weights").notNullable();
    table.text("created_by").notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["role_id"]);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("rubrics");
  await knex.schema.dropTableIfExists("competencies");
}
