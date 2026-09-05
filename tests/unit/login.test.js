import { test } from "node:test";
import assert from "node:assert/strict";

import { createLoginUseCase } from "../../src/application/auth/login.js";
import { createCreateUserAccountUseCase } from "../../src/application/auth/createUserAccount.js";
import { AuthenticationError, ValidationError } from "../../src/domain/errors/index.js";

function stubUserRepository(users = []) {
  const byEmail = new Map(users.map((u) => [u.email, u]));
  return {
    findByEmail: async (email) => byEmail.get(email.toLowerCase()) ?? null,
    create: async (user) => {
      byEmail.set(user.email, user);
      return user;
    },
  };
}

const stubHasher = {
  hash: async (plain) => `hashed:${plain}`,
  compare: async (plain, hash) => hash === `hashed:${plain}`,
};

const stubTokenPort = { sign: (payload) => `token:${JSON.stringify(payload)}` };

test("login succeeds with the right password and signs a token carrying email + role", async () => {
  const userRepository = stubUserRepository([{ id: "u1", email: "hm@example.com", passwordHash: "hashed:secret", role: "hiring_manager" }]);
  const login = createLoginUseCase({ userRepository, passwordHasher: stubHasher, tokenPort: stubTokenPort });

  const result = await login({ email: "hm@example.com", password: "secret" });

  assert.equal(result.token, 'token:{"sub":"hm@example.com","role":"hiring_manager"}');
  assert.deepEqual(result.user, { id: "u1", email: "hm@example.com", role: "hiring_manager" });
});

test("login rejects an unknown email with the same generic message as a wrong password", async () => {
  const userRepository = stubUserRepository([{ id: "u1", email: "hm@example.com", passwordHash: "hashed:secret", role: "hiring_manager" }]);
  const login = createLoginUseCase({ userRepository, passwordHasher: stubHasher, tokenPort: stubTokenPort });

  let unknownEmailError, wrongPasswordError;
  await assert.rejects(() => login({ email: "nobody@example.com", password: "secret" }).catch((e) => { unknownEmailError = e; throw e; }), AuthenticationError);
  await assert.rejects(() => login({ email: "hm@example.com", password: "wrong" }).catch((e) => { wrongPasswordError = e; throw e; }), AuthenticationError);
  assert.equal(unknownEmailError.message, wrongPasswordError.message);
});

test("createUserAccount hashes the password and never stores it plain", async () => {
  const userRepository = stubUserRepository();
  const createUserAccount = createCreateUserAccountUseCase({ userRepository, passwordHasher: stubHasher });

  const user = await createUserAccount({ email: "new@example.com", password: "secret", role: "recruiter" });

  assert.equal(user.passwordHash, "hashed:secret");
  assert.notEqual(user.passwordHash, "secret");
});

test("createUserAccount rejects a duplicate email", async () => {
  const userRepository = stubUserRepository([{ id: "u1", email: "dup@example.com", passwordHash: "hashed:x", role: "recruiter" }]);
  const createUserAccount = createCreateUserAccountUseCase({ userRepository, passwordHasher: stubHasher });

  await assert.rejects(() => createUserAccount({ email: "dup@example.com", password: "y", role: "recruiter" }), ValidationError);
});
