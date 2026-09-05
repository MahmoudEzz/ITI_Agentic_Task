// Mirrors User.js's USER_ROLES exactly.
const USER_ROLES = ["recruiter", "hiring_manager"];

export async function up(knex) {
  await knex.schema.createTable("users", (table) => {
    table.text("id").primary();
    table.text("email").notNullable().unique();
    table.text("password_hash").notNullable();
    table.text("role").notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (${USER_ROLES.map((r) => `'${r}'`).join(", ")}))`);
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("users");
}
