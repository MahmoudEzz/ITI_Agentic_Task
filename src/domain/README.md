# domain

Entities, domain errors, and pure domain services (e.g. `redactProtectedAttributes`, composite-score math).

No imports from `application`, `adapters`, or `infra`. No LLM SDK, vector-store SDK, or web framework dependency — this is the layer the Hexagonal-architecture acceptance test (swap provider = config + one adapter) depends on staying pure.
