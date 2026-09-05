// Port (interface) — implemented by src/adapters/relational/KnexRubricRepository.js.
export class RubricRepositoryPort {
  async create(_rubric) {
    throw new Error("RubricRepositoryPort.create not implemented");
  }

  async findById(_id) {
    throw new Error("RubricRepositoryPort.findById not implemented");
  }

  async findByRoleId(_roleId) {
    throw new Error("RubricRepositoryPort.findByRoleId not implemented");
  }
}
