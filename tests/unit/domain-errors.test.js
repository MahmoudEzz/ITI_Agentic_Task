import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DomainError,
  ValidationError,
  NotFoundError,
  InsufficientEvidenceError,
  ApprovalRequiredError,
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
