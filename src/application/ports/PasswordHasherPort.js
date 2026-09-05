// Port (interface) — implemented by src/adapters/auth/BcryptPasswordHasher.js.
// Kept behind a port (not called directly from application code) for the
// same reason every SDK boundary in this codebase is: swapping the hashing
// library is a config/adapter change, never a business-logic one.
export class PasswordHasherPort {
  async hash(_plainPassword) {
    throw new Error("PasswordHasherPort.hash not implemented");
  }

  async compare(_plainPassword, _passwordHash) {
    throw new Error("PasswordHasherPort.compare not implemented");
  }
}
