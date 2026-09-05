import jwt from "jsonwebtoken";

import { TokenPort } from "../../application/ports/TokenPort.js";
import { AuthenticationError } from "../../domain/errors/index.js";

// One implementation for both signing (login use case) and verifying (the
// HTTP requireAuth preHandler) — see TokenPort.js's header comment for why
// that matters. HS256 (default) is fine here: one shared secret, no
// multi-service key distribution problem to solve.
export class JwtTokenPort extends TokenPort {
  #secret;
  #expiresIn;

  constructor({ secret, expiresIn = "8h" }) {
    super();
    this.#secret = secret;
    this.#expiresIn = expiresIn;
  }

  sign(payload) {
    return jwt.sign(payload, this.#secret, { expiresIn: this.#expiresIn });
  }

  verify(token) {
    try {
      return jwt.verify(token, this.#secret);
    } catch {
      // Never leak whether the failure was expiry, a bad signature, or
      // malformed input — all three collapse to "not authenticated" for the
      // caller, the same fail-closed discipline used for evidence grounding.
      throw new AuthenticationError("Invalid or expired token");
    }
  }
}
