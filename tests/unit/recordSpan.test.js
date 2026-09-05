import { test } from "node:test";
import assert from "node:assert/strict";

import { recordSpan } from "../../src/application/tracing/recordSpan.js";

function stubRepo() {
  const events = [];
  return { events, create: async (event) => events.push(event) };
}

test("recordSpan records started_at/ended_at and returns the wrapped function's result unchanged", async () => {
  const repo = stubRepo();
  const result = await recordSpan(repo, { correlationId: "corr-1", runId: "run-1", span: "test.span" }, async () => "ok");

  assert.equal(result, "ok");
  assert.equal(repo.events.length, 1);
  const [event] = repo.events;
  assert.equal(event.correlationId, "corr-1");
  assert.equal(event.runId, "run-1");
  assert.equal(event.span, "test.span");
  assert.ok(event.startedAt instanceof Date);
  assert.ok(event.endedAt instanceof Date);
  assert.ok(event.endedAt >= event.startedAt);
});

test("recordSpan captures tokensIn/tokensOut/costUsd from the wrapped function's return value", async () => {
  const repo = stubRepo();
  await recordSpan(repo, { correlationId: "corr-1", span: "llm.complete" }, async () => ({ text: "hi", tokensIn: 10, tokensOut: 5, costUsd: 0 }));

  const [event] = repo.events;
  assert.equal(event.tokensIn, 10);
  assert.equal(event.tokensOut, 5);
  assert.equal(event.costUsd, 0);
});

test("recordSpan still records a (failed) span and re-throws the original error when fn throws", async () => {
  const repo = stubRepo();
  const boom = new Error("boom");

  await assert.rejects(
    () =>
      recordSpan(repo, { correlationId: "corr-1", span: "test.span" }, async () => {
        throw boom;
      }),
    (error) => error === boom,
  );

  assert.equal(repo.events.length, 1);
  assert.equal(repo.events[0].attributes.error, "boom");
});

test("recordSpan generates its own correlationId when none is supplied, rather than crashing", async () => {
  const repo = stubRepo();
  await recordSpan(repo, { span: "test.span" }, async () => "ok");

  assert.ok(repo.events[0].correlationId);
});

test("recordSpan is fail-open: with no repository, fn still runs and its result is returned", async () => {
  const result = await recordSpan(undefined, { span: "test.span" }, async () => "ok");
  assert.equal(result, "ok");
});
