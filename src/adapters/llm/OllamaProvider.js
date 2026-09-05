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

    // prompt_eval_count/eval_count are Ollama's own real token counts for
    // this call (FR-9's token accounting) — not estimated client-side.
    return { text: response.message.content, tokensIn: response.prompt_eval_count ?? null, tokensOut: response.eval_count ?? null };
  }
}
