export class DomainError extends Error {
  constructor(message, code) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class ValidationError extends DomainError {
  constructor(message) {
    super(message, "VALIDATION_ERROR");
  }
}

export class NotFoundError extends DomainError {
  constructor(entityName, id) {
    super(`${entityName} not found: ${id}`, "NOT_FOUND");
    this.entityName = entityName;
    this.id = id;
  }
}

// Not a failure — this is the correct, required response when the corpus lacks
// enough evidence to ground an answer. Callers must render it as a normal
// result, never as an error page.
export class InsufficientEvidenceError extends DomainError {
  constructor(message = "Not enough information in the corpus to answer this.") {
    super(message, "INSUFFICIENT_EVIDENCE");
  }
}

export class ApprovalRequiredError extends DomainError {
  constructor(toolName) {
    super(`Tool "${toolName}" is write/side-effecting and requires an approved run before it can execute.`, "APPROVAL_REQUIRED");
    this.toolName = toolName;
  }
}

// A tool call attempted outside the calling agent's declared allow-list
// (see src/application/tools/dispatchTool.js) — the mechanism behind the
// "restricted tool allow-list" claim in the BRD/ADR-0002, not just an
// absence of code that happens not to call it.
export class ToolNotAllowedError extends DomainError {
  constructor(toolName, agentName, allowedTools) {
    super(`Agent "${agentName}" is not allowed to call tool "${toolName}" (allowed: ${allowedTools.join(", ") || "none"})`, "TOOL_NOT_ALLOWED");
    this.toolName = toolName;
    this.agentName = agentName;
    this.allowedTools = allowedTools;
  }
}

// Schema-constrained decoding (ADR-0005) still failed Zod validation after
// exhausting retries — the orchestrator catches this specifically to decide
// whether to transition a run to DEGRADED_DRAFT (FR-5) rather than FAILED.
export class StructuredOutputError extends DomainError {
  constructor(message, { attempts, lastRawOutput } = {}) {
    super(message, "STRUCTURED_OUTPUT_FAILED");
    this.attempts = attempts;
    this.lastRawOutput = lastRawOutput;
  }
}
