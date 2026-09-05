// Port (interface) — implemented by src/adapters/relational/KnexRunRepository.js.
// Run.js (domain) owns transition *validation*; this port only persists
// whatever state the domain entity already decided is legal.
export class RunRepositoryPort {
  async create(_run) {
    throw new Error("RunRepositoryPort.create not implemented");
  }

  async findById(_id) {
    throw new Error("RunRepositoryPort.findById not implemented");
  }

  // Persists a state change AND appends the run_steps row for it, in one
  // transaction — the two must never drift out of sync, since run_steps IS
  // the persisted form of Run.js's in-memory `history` (the brief's
  // step-by-step run inspection by run id requirement).
  async transitionTo(_runId, _state, _options) {
    throw new Error("RunRepositoryPort.transitionTo not implemented");
  }

  async listSteps(_runId) {
    throw new Error("RunRepositoryPort.listSteps not implemented");
  }
}
