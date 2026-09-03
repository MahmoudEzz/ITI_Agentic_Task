# contracts

Zod schemas shared across layers: agent-to-agent I/O, tool-call arguments/results, and HTTP API DTOs.

This is how FR-4's "typed contracts, not free-form text" requirement is met without TypeScript — every agent/tool boundary validates against a schema defined here at runtime, and contract tests in `tests/contract/` assert against these same schemas.
