// Port (interface) — implemented by src/adapters/relational/KnexCompetencyRepository.js.
export class CompetencyRepositoryPort {
  async create(_competency) {
    throw new Error("CompetencyRepositoryPort.create not implemented");
  }

  async findById(_id) {
    throw new Error("CompetencyRepositoryPort.findById not implemented");
  }

  async listAll() {
    throw new Error("CompetencyRepositoryPort.listAll not implemented");
  }
}
