// Port (interface) — implemented by src/adapters/auth/JwtTokenPort.js. One
// implementation signs and verifies, so the HTTP layer's requireAuth
// preHandler and the login use case's token issuance can never drift out of
// sync on secret/algorithm/expiry the way two separate JWT libraries could.
export class TokenPort {
  sign(_payload) {
    throw new Error("TokenPort.sign not implemented");
  }

  // Returns the decoded payload, or throws on an invalid/expired/malformed
  // token — never returns null, so callers can't mistake "invalid" for
  // "no token was supplied" (that case is the caller's own responsibility).
  verify(_token) {
    throw new Error("TokenPort.verify not implemented");
  }
}
