// Port (interface) — implemented by src/adapters/relational/KnexUserRepository.js.
export class UserRepositoryPort {
  async create(_user) {
    throw new Error("UserRepositoryPort.create not implemented");
  }

  async findByEmail(_email) {
    throw new Error("UserRepositoryPort.findByEmail not implemented");
  }

  async findById(_id) {
    throw new Error("UserRepositoryPort.findById not implemented");
  }
}
