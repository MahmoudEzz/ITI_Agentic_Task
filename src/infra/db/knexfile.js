import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// The knex CLI changes process.cwd() to this file's directory before
// requiring it (see `npm run migrate` output: "Working directory changed to
// .../src/infra/db"), so a bare `import "dotenv/config"` would look for
// .env there instead of the repo root. Load it explicitly by path instead.
config({ path: path.join(here, "..", "..", "..", ".env") });

// Knex CLI reads this directly (npm run migrate / migrate:rollback), so it
// stays plain rather than going through loadConfig()'s full Zod validation —
// the CLI's own errors on a missing DATABASE_URL are clear enough on their own.
// Migration/seed directories are absolute (resolved from this file's own
// location) because knex resolves relative paths against process.cwd(),
// which is the repo root when run via npm scripts, not this file's directory.
export default {
  client: "pg",
  connection: process.env.DATABASE_URL,
  migrations: {
    directory: path.join(here, "migrations"),
    extension: "js",
  },
  seeds: {
    directory: path.join(here, "seeds"),
    extension: "js",
  },
};
