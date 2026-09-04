import { createContainer, asValue, asFunction, InjectionMode } from "awilix";
import knexFactory from "knex";

import { loadConfig } from "./env.js";
import { KnexDocumentRepository } from "../../adapters/relational/KnexDocumentRepository.js";
import { KnexCandidateRepository } from "../../adapters/relational/KnexCandidateRepository.js";
import { PgVectorStore } from "../../adapters/vectorstore/PgVectorStore.js";
import { createExtractor } from "../../adapters/extraction/createExtractor.js";
import { OllamaEmbeddingProvider } from "../../adapters/llm/OllamaEmbeddingProvider.js";
import { createIngestDocumentUseCase } from "../../application/ingestion/ingestDocument.js";

// Composition root: the only place in the codebase allowed to know about
// every concrete adapter at once (see CLAUDE.md). `overrides` lets tests
// inject a test config/knex instance without needing a second wiring path.
export function buildContainer(overrides = {}) {
  const container = createContainer({ injectionMode: InjectionMode.PROXY });

  const config = overrides.config ?? loadConfig();
  const knex = overrides.knex ?? knexFactory({ client: "pg", connection: config.databaseUrl });

  container.register({
    config: asValue(config),
    knex: asValue(knex),
    documentRepository: asFunction(({ knex }) => new KnexDocumentRepository(knex)).singleton(),
    candidateRepository: asFunction(({ knex }) => new KnexCandidateRepository(knex)).singleton(),
    vectorStore: asFunction(({ knex }) => new PgVectorStore(knex)).singleton(),
    extractorFactory: asValue((sourceFormat) => createExtractor(sourceFormat)),
    embeddingProvider: asFunction(
      ({ config }) => new OllamaEmbeddingProvider({ host: config.ollama.host, model: config.ollama.embedModel }),
    ).singleton(),
    ingestDocument: asFunction(({ documentRepository, vectorStore, embeddingProvider, extractorFactory }) =>
      createIngestDocumentUseCase({ documentRepository, vectorStore, embeddingProvider, extractorFactory }),
    ).singleton(),
  });

  return container;
}

export async function destroyContainer(container) {
  await container.resolve("knex").destroy();
  await container.dispose();
}
