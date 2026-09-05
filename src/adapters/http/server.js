import Fastify from "fastify";

import { loadConfig } from "../../infra/config/env.js";
import { buildContainer } from "../../infra/config/container.js";
import { registerSecurityPlugins } from "./plugins/security.js";
import authPlugin from "./plugins/auth.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerRunRoutes } from "./routes/runs.js";
import { statusForError } from "./errorMapping.js";

// The composition root for the HTTP layer: takes an already-built DI
// container (so tests can inject a test config/knex the same way
// container.js's own tests do) and wires Fastify around it. Exported
// separately from `.listen()` (below) so tests exercise the exact same app
// via `fastify.inject()`, never a duplicate/simplified test-only app.
export async function buildServer({ container, config }) {
  const app = Fastify({ logger: false });

  await registerSecurityPlugins(app, config);
  await app.register(authPlugin, { tokenPort: container.resolve("tokenPort") });

  app.get("/healthz", async () => ({ status: "ok" }));

  await registerAuthRoutes(app, { login: container.resolve("login") });
  await registerRunRoutes(app, {
    runRepository: container.resolve("runRepository"),
    applyApprovalDecision: container.resolve("applyApprovalDecision"),
  });

  // A single place every thrown error passes through — domain errors never
  // reach the client as a raw stack trace, and an error class added to
  // domain/errors without a mapping here falls through to a safe 500
  // rather than accidentally leaking internals as a 200.
  app.setErrorHandler((error, _request, reply) => {
    const status = statusForError(error);
    reply.status(status).send({ error: error.name ?? "Error", message: error.message });
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const container = buildContainer({ config });
  const app = await buildServer({ container, config });
  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`Domain Copilot API listening on :${config.port}`);
}
