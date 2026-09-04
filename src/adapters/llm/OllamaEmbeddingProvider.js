import { Ollama } from "ollama";
import { EmbeddingProviderPort } from "../../application/ports/EmbeddingProviderPort.js";

const DEFAULT_BATCH_SIZE = 64;

export class OllamaEmbeddingProvider extends EmbeddingProviderPort {
  #client;
  #model;
  #batchSize;

  constructor({ host, model, batchSize = DEFAULT_BATCH_SIZE }) {
    super();
    this.#client = new Ollama({ host });
    this.#model = model;
    this.#batchSize = batchSize;
  }

  async embed(texts) {
    if (texts.length === 0) return [];

    const results = [];
    for (let i = 0; i < texts.length; i += this.#batchSize) {
      const batch = texts.slice(i, i + this.#batchSize);
      const response = await this.#client.embed({ model: this.#model, input: batch });
      results.push(...response.embeddings);
    }
    return results;
  }
}
