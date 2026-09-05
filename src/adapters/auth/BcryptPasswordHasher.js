import bcrypt from "bcryptjs";

import { PasswordHasherPort } from "../../application/ports/PasswordHasherPort.js";

// bcryptjs (pure JS), not bcrypt — same reasoning as ADR-0004's OCR
// rasterization swap: no native binding to compile, works identically on
// host/CI/Docker with no prebuild-availability risk, at no meaningful cost
// for this project's login-time-only call frequency.
export class BcryptPasswordHasher extends PasswordHasherPort {
  #saltRounds;

  constructor({ saltRounds = 10 } = {}) {
    super();
    this.#saltRounds = saltRounds;
  }

  async hash(plainPassword) {
    return bcrypt.hash(plainPassword, this.#saltRounds);
  }

  async compare(plainPassword, passwordHash) {
    return bcrypt.compare(plainPassword, passwordHash);
  }
}
