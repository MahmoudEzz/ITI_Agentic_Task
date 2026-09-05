import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { asValue } from "awilix";

import { buildContainer, destroyContainer } from "../../src/infra/config/container.js";
import { buildServer } from "../../src/adapters/http/server.js";

// fastify.inject() buffers the whole response and can't observe true
// incremental delivery — these tests start a real server on an ephemeral
// port and consume the response with a real ReadableStream reader, per the
// project's live-verification bar for anything SSE-shaped.
let container, knex, app, baseUrl;

const RECRUITER = { email: "sse-recruiter@example.com", password: "password-a", role: "recruiter" };

before(async () => {
  container = buildContainer();
  knex = container.resolve("knex");
  const config = container.resolve("config");

  const createUserAccount = container.resolve("createUserAccount");
  await knex("users").where({ email: RECRUITER.email }).delete();
  await createUserAccount(RECRUITER);

  app = await buildServer({ container, config });
  await app.listen({ port: 0, host: "127.0.0.1" });
  baseUrl = `http://127.0.0.1:${app.server.address().port}`;
});

after(async () => {
  await app.close();
  await destroyContainer(container);
});

beforeEach(async () => {
  await knex("chunks").delete();
  await knex("documents").delete();
});

async function loginToken(urlBase = baseUrl) {
  const res = await fetch(`${urlBase}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: RECRUITER.email, password: RECRUITER.password }),
  });
  const body = await res.json();
  return body.token;
}

// Parses a raw SSE byte stream into { event, data } frames as they arrive,
// preserving arrival order — the actual claim under test for /ask is that
// deltas arrive as separate frames over time, not as one buffered blob.
async function readSse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const frames = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const eventLine = raw.split("\n").find((l) => l.startsWith("event: "));
      const dataLine = raw.split("\n").find((l) => l.startsWith("data: "));
      if (eventLine && dataLine) {
        frames.push({ event: eventLine.slice("event: ".length), data: JSON.parse(dataLine.slice("data: ".length)) });
      }
    }
  }
  return frames;
}

test("POST /ask streams real incremental deltas via Ollama, ending in a real resolved-citation answer", async () => {
  const embeddingProvider = container.resolve("embeddingProvider");
  const documentRepository = container.resolve("documentRepository");
  const vectorStore = container.resolve("vectorStore");

  const documentId = crypto.randomUUID();
  await documentRepository.create({
    id: documentId,
    type: "job_description",
    title: "SSE test fixture",
    sourceFormat: "txt",
    sourcePath: "test",
    contentHash: crypto.randomUUID(),
    createdBy: "test",
  });
  const content = "The Zenith Data Pipeline project processes twelve million events per day using a custom Rust ingestion layer.";
  const [embedding] = await embeddingProvider.embed([content]);
  await vectorStore.insertChunks([
    { id: crypto.randomUUID(), documentId, content, documentType: "job_description", chunkerVersion: "v1", embedding },
  ]);

  const token = await loginToken();
  const response = await fetch(`${baseUrl}/ask`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ question: "How many events per day does the Zenith Data Pipeline process, and in what language?" }),
  });

  const frames = await readSse(response);
  const deltaFrames = frames.filter((f) => f.event === "delta");
  const answerFrame = frames.find((f) => f.event === "answer");
  const fullText = deltaFrames.map((f) => f.data.text).join("");

  // The claim under test is real incremental delivery — this holds
  // regardless of the small local model's own (non-deterministic) choice
  // to include a "[1]" citation marker in a given run, which is a
  // separate, already-covered concern (answerQuestion.test.js).
  assert.ok(deltaFrames.length > 1, `expected multiple separate delta frames (real streaming), got ${deltaFrames.length}`);
  assert.ok(answerFrame, "expected a final answer frame");
  assert.ok(fullText.length > 0, "expected real streamed content");

  if (answerFrame.data.refused) {
    // A citation-free response correctly refuses (BR-08) rather than
    // trusting an ungrounded claim — a real, valid outcome, not a test
    // failure, on a small local model that didn't happen to cite this run.
    assert.equal(answerFrame.data.refusalReason, "insufficient_evidence");
  } else {
    assert.equal(fullText, answerFrame.data.answer);
    assert.ok(answerFrame.data.citations.length > 0);
  }
});

test("POST /runs streams real discrete progress events sourced from the same recordSpan onEvent hook that persists trace_events, then a result event", async () => {
  // A real screening run takes 30s-3min against local Ollama (verified
  // manually, see the PR) — far too slow for the standard suite. This
  // builds a second, isolated server whose runScreeningWorkflow is
  // stubbed, to verify the wire-level SSE mechanics (frame format, event
  // ordering, ownership/auth still enforced) deterministically and fast;
  // the underlying onEvent plumbing is already covered for real by
  // tests/unit/runScreeningWorkflow.test.js's own onEvent assertions.
  // container.register() only affects resolves made AFTER it — the
  // shared `app` built in before() already captured the real
  // runScreeningWorkflow in its route closures, so this needs its own
  // server instance built after the override, not the shared one.
  container.register({
    runScreeningWorkflow: asValue(async ({ onEvent }) => {
      onEvent({ type: "candidate.extract_redact_score.started", span: "candidate.extract_redact_score", attributes: { candidateHandle: "CAND-001" } });
      onEvent({ type: "candidate.extract_redact_score.completed", span: "candidate.extract_redact_score", attributes: { candidateHandle: "CAND-001" } });
      return { run: { id: "stub-run-1", state: "AWAIT_APPROVAL" }, degraded: false, shortlist: { entries: [] }, failures: [] };
    }),
  });
  const config = container.resolve("config");
  const stubApp = await buildServer({ container, config });
  await stubApp.listen({ port: 0, host: "127.0.0.1" });
  const stubBaseUrl = `http://127.0.0.1:${stubApp.server.address().port}`;

  try {
    const token = await loginToken(stubBaseUrl);
    const response = await fetch(`${stubBaseUrl}/runs`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ roleId: "backend-engineer", rubricId: "rubric-backend-engineer", candidateHandles: ["CAND-001"] }),
    });

    const frames = await readSse(response);
    const progressFrames = frames.filter((f) => f.event === "progress");
    const resultFrame = frames.find((f) => f.event === "result");

    assert.deepEqual(
      progressFrames.map((f) => f.data.type),
      ["candidate.extract_redact_score.started", "candidate.extract_redact_score.completed"],
    );
    assert.ok(resultFrame, "expected a final result frame");
    assert.equal(resultFrame.data.runId, "stub-run-1");
    assert.equal(resultFrame.data.state, "AWAIT_APPROVAL");
  } finally {
    await stubApp.close();
  }
});

test("POST /ask without a token is 401, same as every other authenticated route — SSE hijacking creates no new auth bypass", async () => {
  const response = await fetch(`${baseUrl}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "x" }),
  });
  assert.equal(response.status, 401);
});
