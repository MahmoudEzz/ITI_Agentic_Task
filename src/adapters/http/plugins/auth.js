import fp from "fastify-plugin";

import { AuthenticationError, AuthorizationError } from "../../../domain/errors/index.js";

const BEARER_PATTERN = /^Bearer (.+)$/;

// Decorates every request with `requireAuth` (verifies the token, sets
// request.user = { email, role }) and `requireRole(role)` (requireAuth,
// then a role check) as preHandlers a route opts into explicitly — there is
// no global auth requirement, since /auth/login and /healthz must stay
// reachable without one.
async function authPlugin(app, { tokenPort }) {
  app.decorateRequest("user", null);

  app.decorate("requireAuth", async function requireAuth(request) {
    const header = request.headers.authorization;
    const match = header && BEARER_PATTERN.exec(header);
    if (!match) throw new AuthenticationError("Missing or malformed Authorization header");

    const payload = tokenPort.verify(match[1]); // throws AuthenticationError itself on invalid/expired
    request.user = { email: payload.sub, role: payload.role };
  });

  app.decorate("requireRole", function requireRole(role) {
    return async function requireRolePreHandler(request) {
      await app.requireAuth(request);
      if (request.user.role !== role) {
        throw new AuthorizationError(`This action requires the "${role}" role`);
      }
    };
  });
}

export default fp(authPlugin);
