import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";

// One place registering all three OWASP-Web-Top-10 controls that apply to
// every route uniformly (headers, origin policy, request-rate abuse) — kept
// separate from auth.js, which is the per-route opt-in controls instead.
export async function registerSecurityPlugins(app, { corsAllowedOrigins, rateLimit: rateLimitConfig }) {
  await app.register(helmet);

  // An explicit allow-list, never "*" — an empty list means no browser
  // origin is allowed at all (server-to-server calls, curl, and this
  // project's own fastify.inject() tests are unaffected; CORS only governs
  // browser-enforced cross-origin requests).
  await app.register(cors, { origin: corsAllowedOrigins });

  await app.register(rateLimit, { max: rateLimitConfig.max, timeWindow: rateLimitConfig.windowMs });
}
