import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DomainError,
  ValidationError,
  NotFoundError,
  InsufficientEvidenceError,
  ApprovalRequiredError,
  ToolNotAllowedError,
  StructuredOutputError,
  AuthenticationError,
  AuthorizationError,
} from "../../src/domain/errors/index.js";

test("ValidationError carries a VALIDATION_ERROR code and is a DomainError", () => {
  const err = new ValidationError("bad input");
  assert.ok(err instanceof DomainError);
  assert.equal(err.code, "VALIDATION_ERROR");
  assert.equal(err.message, "bad input");
});

test("NotFoundError formats the entity name and id into its message", () => {
  const err = new NotFoundError("Candidate", "cand-123");
  assert.equal(err.code, "NOT_FOUND");
  assert.match(err.message, /Candidate/);
  assert.match(err.message, /cand-123/);
});

test("InsufficientEvidenceError has a sensible default message for correct refusal", () => {
  const err = new InsufficientEvidenceError();
  assert.equal(err.code, "INSUFFICIENT_EVIDENCE");
  assert.match(err.message, /not enough information/i);
});

test("ApprovalRequiredError names the gated tool", () => {
  const err = new ApprovalRequiredError("finalize_shortlist");
  assert.equal(err.code, "APPROVAL_REQUIRED");
  assert.equal(err.toolName, "finalize_shortlist");
  assert.match(err.message, /finalize_shortlist/);
});

test("ToolNotAllowedError names the agent, the rejected tool, and what was allowed", () => {
  const err = new ToolNotAllowedError("search_corpus", "rubric_scorer", []);
  assert.equal(err.code, "TOOL_NOT_ALLOWED");
  assert.equal(err.toolName, "search_corpus");
  assert.equal(err.agentName, "rubric_scorer");
  assert.match(err.message, /search_corpus/);
  assert.match(err.message, /rubric_scorer/);
  assert.match(err.message, /none/);
});

test("StructuredOutputError carries attempts and the last raw output for debugging", () => {
  const err = new StructuredOutputError("validation failed twice", { attempts: 3, lastRawOutput: '{"x":1}' });
  assert.equal(err.code, "STRUCTURED_OUTPUT_FAILED");
  assert.equal(err.attempts, 3);
  assert.equal(err.lastRawOutput, '{"x":1}');
});

test("AuthenticationError has a sensible default message and code", () => {
  const err = new AuthenticationError();
  assert.equal(err.code, "AUTHENTICATION_REQUIRED");
  assert.match(err.message, /authentication/i);
});

test("AuthorizationError has a sensible default message and code", () => {
  const err = new AuthorizationError();
  assert.equal(err.code, "NOT_AUTHORIZED");
  assert.match(err.message, /not authorized/i);
});
