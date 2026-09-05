import { Ollama } from "ollama";
import { LLMProviderPort } from "../../application/ports/LLMProviderPort.js";

export class OllamaProvider extends LLMProviderPort {
  #client;
  #model;

  constructor({ host, model }) {
    super();
    this.#client = new Ollama({ host });
    this.#model = model;
  }

  async complete({ system, prompt, schema } = {}) {
    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });

    const response = await this.#client.chat({
      model: this.#model,
      messages,
      stream: false,
      ...(schema ? { format: schema } : {}),
    });

    return { text: response.message.content };
  }
}
