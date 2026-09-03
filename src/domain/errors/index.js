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
