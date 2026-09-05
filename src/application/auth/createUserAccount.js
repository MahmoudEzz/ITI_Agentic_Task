import { createUser } from "../../domain/entities/User.js";
import { ValidationError } from "../../domain/errors/index.js";

// No self-registration UI is planned (docs/BRD.md's two personas are
// provisioned by an admin/operator, not signed up) — this is the one path
// that creates a row in `users`, used by scripts/users.js.
export function createCreateUserAccountUseCase({ userRepository, passwordHasher }) {
  return async function createUserAccount({ email, password, role }) {
    const existing = await userRepository.findByEmail(email);
    if (existing) throw new ValidationError(`A user with email "${email}" already exists`);

    const passwordHash = await passwordHasher.hash(password);
    const user = createUser({ id: crypto.randomUUID(), email, passwordHash, role });
    return userRepository.create(user);
  };
}
