import { ZodError } from "zod";

import {
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  ApprovalRequiredError,
} from "../../domain/errors/index.js";

// Central domain-error -> HTTP-status map, consulted by server.js's
// setErrorHandler — one place, so a new domain error can't silently fall
// through to a raw 500 with a stack trace leaking to the client.
const STATUS_BY_ERROR_CLASS = [
  [AuthenticationError, 401],
  [AuthorizationError, 403],
  [NotFoundError, 404],
  [ApprovalRequiredError, 409],
  [ValidationError, 400],
  [ZodError, 400], // request-body/query schema violations — same 400 as a domain ValidationError
];

export function statusForError(error) {
  for (const [ErrorClass, status] of STATUS_BY_ERROR_CLASS) {
    if (error instanceof ErrorClass) return status;
  }
  // Fastify and its plugins (e.g. @fastify/rate-limit's 429) set this
  // themselves — respected as a fallback so a plugin's own correct status
  // isn't overridden by our domain-error-only map before it, but a bare
  // domain Error with no statusCode still safely defaults to 500 below.
  if (typeof error.statusCode === "number") return error.statusCode;
  return 500;
}
