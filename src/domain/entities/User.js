import { ValidationError } from "../errors/index.js";

// Two roles only (docs/BRD.md personas): a Recruiter ingests/runs the
// workflow but cannot approve; a Hiring Manager can additionally approve,
// reject, or edit-and-approve a shortlist and view the bias audit trail.
export const USER_ROLES = Object.freeze(["recruiter", "hiring_manager"]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createUser({ id, email, passwordHash, role, createdAt = new Date() }) {
  if (!id) throw new ValidationError("User requires an id");
  if (!email || !EMAIL_PATTERN.test(email)) throw new ValidationError(`User requires a valid email (got "${email}")`);
  if (!passwordHash) throw new ValidationError("User requires a passwordHash — never construct a User from a plaintext password");
  if (!USER_ROLES.includes(role)) throw new ValidationError(`User role must be one of ${USER_ROLES.join(", ")} (got "${role}")`);

  return Object.freeze({ id, email: email.toLowerCase(), passwordHash, role, createdAt });
}
