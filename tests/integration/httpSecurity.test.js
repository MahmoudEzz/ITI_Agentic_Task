import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { buildContainer, destroyContainer } from "../../src/infra/config/container.js";
import { buildServer } from "../../src/adapters/http/server.js";

let container, knex, app;

const RECRUITER_A = { email: "recruiter-a@example.com", password: "password-a", role: "recruiter" };
const RECRUITER_B = { email: "recruiter-b@example.com", password: "password-b", role: "recruiter" };
const HIRING_MANAGER = { email: "hm@example.com", password: "password-hm", role: "hiring_manager" };

before(async () => {
  container = buildContainer();
  knex = container.resolve("knex");
  const config = container.resolve("config");
  app = await buildServer({ container, config });

  const createUserAccount = container.resolve("createUserAccount");
  const testEmails = [RECRUITER_A, RECRUITER_B, HIRING_MANAGER].map((u) => u.email);
  await knex("users").whereIn("email", testEmails).delete(); // idempotent across repeated test runs
  for (const u of [RECRUITER_A, RECRUITER_B, HIRING_MANAGER]) {
    await createUserAccount(u);
  }
});

after(async () => {
  await app.close();
  await destroyContainer(container);
});

beforeEach(async () => {
  // FK order: report_assets/shortlists -> approvals -> runs; run_steps -> runs.
  await knex("run_steps").delete();
  await knex("report_assets").delete();
  await knex("shortlists").delete();
  await knex("approvals").delete();
  await knex("runs").delete();
});

async function loginAs(user) {
  const res = await app.inject({ method: "POST", url: "/auth/login", payload: { email: user.email, password: user.password } });
  assert.equal(res.statusCode, 200);
  return res.json().token;
}

async function createRun({ createdBy, state = "AWAIT_APPROVAL" } = {}) {
  const runRepository = container.resolve("runRepository");
  const id = crypto.randomUUID();
  await runRepository.create({ id, workflowType: "screening", state: "INGEST_CONTEXT", createdBy });
  if (state !== "INGEST_CONTEXT") await runRepository.transitionTo(id, state);
  return id;
}

test("POST /auth/login rejects a wrong password with 401 and no token", async () => {
  const res = await app.inject({ method: "POST", url: "/auth/login", payload: { email: RECRUITER_A.email, password: "wrong" } });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().token, undefined);
});

test("POST /auth/login rejects a malformed body with 400", async () => {
  const res = await app.inject({ method: "POST", url: "/auth/login", payload: { email: RECRUITER_A.email } });
  assert.equal(res.statusCode, 400);
});

test("GET /runs/:id with no Authorization header is 401", async () => {
  const runId = await createRun({ createdBy: RECRUITER_A.email });
  const res = await app.inject({ method: "GET", url: `/runs/${runId}` });
  assert.equal(res.statusCode, 401);
});

test("GET /runs/:id: the owning recruiter can view their own run", async () => {
  const runId = await createRun({ createdBy: RECRUITER_A.email });
  const token = await loginAs(RECRUITER_A);
  const res = await app.inject({ method: "GET", url: `/runs/${runId}`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().id, runId);
});

test("GET /runs/:id: a different recruiter gets 404, not 403 (existence not disclosed)", async () => {
  const runId = await createRun({ createdBy: RECRUITER_A.email });
  const token = await loginAs(RECRUITER_B);
  const res = await app.inject({ method: "GET", url: `/runs/${runId}`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(res.statusCode, 404);
});

test("GET /runs/:id: a hiring manager can view any run regardless of who created it", async () => {
  const runId = await createRun({ createdBy: RECRUITER_A.email });
  const token = await loginAs(HIRING_MANAGER);
  const res = await app.inject({ method: "GET", url: `/runs/${runId}`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(res.statusCode, 200);
});

test("GET /runs/:id: an unknown run id is 404 even for a hiring manager", async () => {
  const token = await loginAs(HIRING_MANAGER);
  const res = await app.inject({ method: "GET", url: `/runs/does-not-exist`, headers: { authorization: `Bearer ${token}` } });
  assert.equal(res.statusCode, 404);
});

test("GET /runs/:id/trace: returns real trace_events rows, ownership-scoped the same as GET /runs/:id", async () => {
  const runId = await createRun({ createdBy: RECRUITER_A.email });
  const traceEventRepository = container.resolve("traceEventRepository");
  await traceEventRepository.create({
    id: crypto.randomUUID(),
    correlationId: runId,
    runId,
    span: "llm.evidence_extractor",
    startedAt: new Date(),
    endedAt: new Date(),
    attributes: {},
    tokensIn: 50,
    tokensOut: 20,
    costUsd: 0,
  });

  const ownerToken = await loginAs(RECRUITER_A);
  const ownerRes = await app.inject({ method: "GET", url: `/runs/${runId}/trace`, headers: { authorization: `Bearer ${ownerToken}` } });
  assert.equal(ownerRes.statusCode, 200);
  const body = ownerRes.json();
  assert.equal(body.events.length, 1);
  assert.equal(body.events[0].span, "llm.evidence_extractor");
  assert.equal(body.events[0].correlationId, runId);

  const otherToken = await loginAs(RECRUITER_B);
  const otherRes = await app.inject({ method: "GET", url: `/runs/${runId}/trace`, headers: { authorization: `Bearer ${otherToken}` } });
  assert.equal(otherRes.statusCode, 404);
});

test("POST /runs/:id/decision: a recruiter is forbidden (403) regardless of ownership", async () => {
  const runId = await createRun({ createdBy: RECRUITER_A.email });
  const token = await loginAs(RECRUITER_A);
  const res = await app.inject({
    method: "POST",
    url: `/runs/${runId}/decision`,
    headers: { authorization: `Bearer ${token}` },
    payload: { decision: "rejected" },
  });
  assert.equal(res.statusCode, 403);
});

test("POST /runs/:id/decision: a hiring manager can reject a run they didn't create, and it really transitions", async () => {
  const runId = await createRun({ createdBy: RECRUITER_A.email });
  const token = await loginAs(HIRING_MANAGER);
  const res = await app.inject({
    method: "POST",
    url: `/runs/${runId}/decision`,
    headers: { authorization: `Bearer ${token}` },
    payload: { decision: "rejected", comment: "not a fit" },
  });
  assert.equal(res.statusCode, 200);

  const runRepository = container.resolve("runRepository");
  const run = await runRepository.findById(runId);
  assert.equal(run.state, "REJECTED");
});

test("GET /healthz needs no auth and carries real helmet security headers", async () => {
  const res = await app.inject({ method: "GET", url: "/healthz" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.ok(res.headers["x-dns-prefetch-control"]);
});

test("GET /readyz needs no auth, reports real Postgres connectivity, and never fails the whole probe on Ollama alone", async () => {
  const res = await app.inject({ method: "GET", url: "/readyz" });
  const body = res.json();
  // Postgres is genuinely reachable in this test environment — a real
  // check, not a stub — so this must be 200/ready, not merely well-formed.
  assert.equal(res.statusCode, 200);
  assert.equal(body.status, "ready");
  assert.equal(body.checks.postgres, true);
  assert.equal(typeof body.checks.ollama, "boolean");
});

test("rate limiting returns 429 after the configured burst, on a fresh app instance with a low limit", async () => {
  const config = container.resolve("config");
  const limitedApp = await buildServer({ container, config: { ...config, rateLimit: { max: 3, windowMs: 60_000 } } });
  try {
    const statuses = [];
    for (let i = 0; i < 5; i++) {
      const res = await limitedApp.inject({ method: "GET", url: "/healthz" });
      statuses.push(res.statusCode);
    }
    assert.ok(statuses.includes(429), `expected a 429 in the burst, got ${statuses.join(",")}`);
  } finally {
    await limitedApp.close();
  }
});
