// `knex migrate:latest --knexfile ...` always reads DATABASE_URL, and the
// npm-script-level `DATABASE_URL=$TEST_DATABASE_URL` trick doesn't work here
// since TEST_DATABASE_URL only exists inside .env, not as an actual exported
// shell variable — so this loads .env itself first, then re-execs the knex
// CLI with DATABASE_URL overridden to TEST_DATABASE_URL's value.
import "dotenv/config";
import { execFileSync } from "node:child_process";

if (!process.env.TEST_DATABASE_URL) {
  console.error("TEST_DATABASE_URL is not set in .env — see .env.example (issue #35).");
  process.exit(1);
}

execFileSync("npx", ["knex", "migrate:latest", "--knexfile", "src/infra/db/knexfile.js"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
});
