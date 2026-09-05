import { AuthenticationError } from "../../domain/errors/index.js";

// Same generic failure message whether the email doesn't exist or the
// password is wrong — user enumeration via a differing error is exactly
// what this collapses. `sub` in the signed payload is the email (not a
// stand-alone user_id FK), matching how `runs.created_by`/`decided_by`
// already store the acting identity as a plain email string.
export function createLoginUseCase({ userRepository, passwordHasher, tokenPort }) {
  return async function login({ email, password }) {
    const user = await userRepository.findByEmail(email);
    if (!user) throw new AuthenticationError("Invalid email or password");

    const valid = await passwordHasher.compare(password, user.passwordHash);
    if (!valid) throw new AuthenticationError("Invalid email or password");

    const token = tokenPort.sign({ sub: user.email, role: user.role });
    return { token, user: { id: user.id, email: user.email, role: user.role } };
  };
}
