// FR-9's trace store (docs/SYSTEM-DESIGN.md's Phase 7 scope) — a custom
// table rather than standing up OTel/Jaeger, chosen the same way ADR-0003
// chose pgvector-in-Postgres over a second stateful service, to fit the
// time budget (the OTel upgrade path is named in docs/SYSTEM-DESIGN.md's
// gap table, not hidden as a permanent architectural decision).
//
// `run_id` is nullable: a plain `POST /ask` call has no run at all, but
// still gets a correlation_id and still deserves a trace. `correlation_id`
// equals `run_id` for a screening run (one request = one run = one
// correlation scope, for this single-process app) and is a freshly
// generated id for a run-less request — see runScreeningWorkflow.js and
// answerQuestion.js's call sites.
export async function up(knex) {
  await knex.schema.createTable("trace_events", (table) => {
    table.text("id").primary();
    table.text("correlation_id").notNullable();
    table.text("run_id").nullable().references("id").inTable("runs").onDelete("CASCADE");
    table.text("span").notNullable(); // e.g. "agent.evidence_extractor", "tool.get_candidate_chunks", "llm.complete"
    table.text("parent_span").nullable();
    table.timestamp("started_at", { useTz: true }).notNullable();
    table.timestamp("ended_at", { useTz: true }).nullable();
    table.jsonb("attributes").notNullable().defaultTo("{}");
    table.integer("tokens_in").nullable();
    table.integer("tokens_out").nullable();
    // Both configured providers (local Ollama, Gemini's free tier) are
    // genuinely free — this is a real 0, not an unmeasured placeholder;
    // see docs/SECURITY.md's token/cost accounting note.
    table.decimal("cost_usd", 10, 6).nullable();

    table.index(["correlation_id"]);
    table.index(["run_id"]);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("trace_events");
}
