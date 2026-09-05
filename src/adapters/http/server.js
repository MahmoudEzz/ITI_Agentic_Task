import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "../../infra/config/env.js";
import { buildContainer } from "../../infra/config/container.js";
import { registerSecurityPlugins } from "./plugins/security.js";
import authPlugin from "./plugins/auth.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerRunRoutes } from "./routes/runs.js";
import { registerAskRoutes } from "./routes/ask.js";
import { statusForError } from "./errorMapping.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const webPublicDir = path.join(here, "..", "web", "public");

// The composition root for the HTTP layer: takes an already-built DI
// container (so tests can inject a test config/knex the same way
// container.js's own tests do) and wires Fastify around it. Exported
// separately from `.listen()` (below) so tests exercise the exact same app
// via `fastify.inject()`, never a duplicate/simplified test-only app.
export async function buildServer({ container, config }) {
  const app = Fastify({ logger: false });

  await registerSecurityPlugins(app, config);
  await app.register(authPlugin, { tokenPort: container.resolve("tokenPort") });

  // The minimal static UI (Phase 7 PR4) — plain HTML/CSS/vanilla JS, no
  // build step, served under /app so it can never collide with an API
  // route at the root path (POST /ask, GET /runs, etc). The page itself
  // calls the same authenticated JSON/SSE API a curl/CLI user would.
  await app.register(fastifyStatic, { root: webPublicDir, prefix: "/app/" });
  app.get("/", async (_request, reply) => reply.redirect("/app/"));

  app.get("/healthz", async () => ({ status: "ok" }));

  // FR-9: liveness (above) says "the process is up"; readiness says "the
  // process can actually do its job." Postgres/pgvector is a hard
  // dependency — its check has no timeout override because every request
  // needs it anyway. Ollama is checked with a short timeout and reported
  // as its own degraded dimension rather than failing the whole probe: a
  // slow/cold local model (documented, real variance — see
  // docs/SYSTEM-DESIGN.md's gap table) would otherwise make a compose
  // healthcheck flap the whole API in and out of "ready" for no real
  // outage. A 200 with checks.ollama = false is the correct signal here,
  // not a 503 — the Q&A/screening routes will simply be slow or fall
  // back to Gemini, not unavailable.
  app.get("/readyz", async (_request, reply) => {
    const knex = container.resolve("knex");
    const checks = { postgres: false, ollama: false };

    try {
      await knex.raw("select 1");
      checks.postgres = true;
    } catch {
      // stays false
    }

    try {
      const response = await fetch(`${config.ollama.host}/api/tags`, { signal: AbortSignal.timeout(1500) });
      checks.ollama = response.ok;
    } catch {
      // stays false
    }

    reply.status(checks.postgres ? 200 : 503).send({ status: checks.postgres ? "ready" : "not_ready", checks });
  });

  await registerAuthRoutes(app, { login: container.resolve("login") });
  await registerRunRoutes(app, {
    runRepository: container.resolve("runRepository"),
    applyApprovalDecision: container.resolve("applyApprovalDecision"),
    traceEventRepository: container.resolve("traceEventRepository"),
    runScreeningWorkflow: container.resolve("runScreeningWorkflow"),
  });
  await registerAskRoutes(app, { answerQuestionStream: container.resolve("answerQuestionStream") });

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
