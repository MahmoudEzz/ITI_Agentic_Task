import { UserRepositoryPort } from "../../application/ports/UserRepositoryPort.js";

function rowToUser(row) {
  if (!row) return null;
  return { id: row.id, email: row.email, passwordHash: row.password_hash, role: row.role, createdAt: row.created_at };
}

export class KnexUserRepository extends UserRepositoryPort {
  #knex;

  constructor(knex) {
    super();
    this.#knex = knex;
  }

  async create(user) {
    const [row] = await this.#knex("users")
      .insert({ id: user.id, email: user.email, password_hash: user.passwordHash, role: user.role })
      .returning("*");
    return rowToUser(row);
  }

  async findByEmail(email) {
    const row = await this.#knex("users").where({ email: email.toLowerCase() }).first();
    return rowToUser(row);
  }

  async findById(id) {
    const row = await this.#knex("users").where({ id }).first();
    return rowToUser(row);
  }
}
