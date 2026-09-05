import { test } from "node:test";
import assert from "node:assert/strict";

import { BcryptPasswordHasher } from "../../src/adapters/auth/BcryptPasswordHasher.js";
import { JwtTokenPort } from "../../src/adapters/auth/JwtTokenPort.js";
import { AuthenticationError } from "../../src/domain/errors/index.js";

test("BcryptPasswordHasher round-trips a real hash and rejects a wrong password", async () => {
  const hasher = new BcryptPasswordHasher({ saltRounds: 4 }); // low rounds — this test only needs correctness, not real-world cost
  const hash = await hasher.hash("correct horse battery staple");

  assert.notEqual(hash, "correct horse battery staple");
  assert.equal(await hasher.compare("correct horse battery staple", hash), true);
  assert.equal(await hasher.compare("wrong", hash), false);
});

test("JwtTokenPort signs and verifies a real token, round-tripping the payload", () => {
  const tokenPort = new JwtTokenPort({ secret: "test-secret", expiresIn: "1h" });
  const token = tokenPort.sign({ sub: "user@example.com", role: "recruiter" });

  const decoded = tokenPort.verify(token);
  assert.equal(decoded.sub, "user@example.com");
  assert.equal(decoded.role, "recruiter");
});

test("JwtTokenPort.verify throws AuthenticationError (not the raw jwt error) on a garbage token", () => {
  const tokenPort = new JwtTokenPort({ secret: "test-secret" });
  assert.throws(() => tokenPort.verify("not-a-real-token"), AuthenticationError);
});

test("JwtTokenPort.verify throws AuthenticationError on a token signed with a different secret", () => {
  const signed = new JwtTokenPort({ secret: "secret-a" }).sign({ sub: "user@example.com", role: "recruiter" });
  const verifier = new JwtTokenPort({ secret: "secret-b" });
  assert.throws(() => verifier.verify(signed), AuthenticationError);
});

test("JwtTokenPort.verify throws AuthenticationError on an already-expired token", () => {
  const tokenPort = new JwtTokenPort({ secret: "test-secret", expiresIn: "-1s" });
  const token = tokenPort.sign({ sub: "user@example.com", role: "recruiter" });
  assert.throws(() => tokenPort.verify(token), AuthenticationError);
});
