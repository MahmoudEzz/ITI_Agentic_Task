import { LLMProviderPort } from "../../application/ports/LLMProviderPort.js";

// Fallback chain (ADR-0005): try each provider in order, fall through on
// failure; never silently substitute a mock in a live run — if every real
// provider fails, this throws and the caller (the Q&A use case) surfaces
// that as a real error, distinct from a retrieval-driven refusal.
export class FallbackLLMProvider extends LLMProviderPort {
  #providers;

  // providers: [{ name, provider }], tried in array order.
  constructor(providers) {
    super();
    if (providers.length === 0) throw new Error("FallbackLLMProvider requires at least one provider");
    this.#providers = providers;
  }

  async complete(request) {
    const failures = [];
    for (const { name, provider } of this.#providers) {
      try {
        return await provider.complete(request);
      } catch (error) {
        failures.push(`${name}: ${error.message}`);
      }
    }
    throw new Error(`All LLM providers in the fallback chain failed — ${failures.join("; ")}`);
  }
}
