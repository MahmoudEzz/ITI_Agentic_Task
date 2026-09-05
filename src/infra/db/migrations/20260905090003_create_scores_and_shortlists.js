export async function up(knex) {
  await knex.schema.createTable("scores", (table) => {
    table.text("id").primary();
    table.text("run_id").notNullable().references("id").inTable("runs").onDelete("CASCADE");
    table.text("candidate_handle").notNullable(); // opaque CAND-N, never a candidates.id join here — see Score.js/ADR-0006
    table.text("competency_id").notNullable();
    table.decimal("value", 4, 2).notNullable();
    table.text("rationale").notNullable();
    table.jsonb("evidence_chunk_ids").notNullable(); // string[] — a score without a citation is not grounded, see Score.js
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(["run_id", "candidate_handle", "competency_id"]);
    table.index(["run_id"]);
  });

  // One shortlist per run. `entries` is jsonb ([{candidateHandle, rank,
  // summary, interviewProbes}]) rather than a normalized junction table —
  // same expedient-for-MVP-scale choice already made for
  // rubrics.competency_weights (see its migration's comment), and for the
  // same reason: never queried by entry independently of its shortlist.
  await knex.schema.createTable("shortlists", (table) => {
    table.text("id").primary();
    table.text("run_id").notNullable().references("id").inTable("runs").onDelete("CASCADE").unique();
    table.text("role_id").notNullable();
    table.jsonb("entries").notNullable();
    table.boolean("degraded").notNullable().defaultTo(false); // true if drafted via the DEGRADED_DRAFT path — surfaced, never hidden
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("shortlists");
  await knex.schema.dropTableIfExists("scores");
}
