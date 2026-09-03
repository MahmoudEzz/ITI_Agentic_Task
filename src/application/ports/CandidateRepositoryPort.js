// Port (interface) — implemented by src/adapters/relational/KnexCandidateRepository.js.
export class CandidateRepositoryPort {
  async create(_candidate) {
    throw new Error("CandidateRepositoryPort.create not implemented");
  }

  async findByHandle(_handle) {
    throw new Error("CandidateRepositoryPort.findByHandle not implemented");
  }

  async findById(_id) {
    throw new Error("CandidateRepositoryPort.findById not implemented");
  }
}
