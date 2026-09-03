# infra

Environment/config loading and validation, the DI composition root (`awilix`), and database migrations/seeds (Knex).

This is where all adapters get wired together and configuration is read — the only place allowed to know about every concrete implementation at once.
