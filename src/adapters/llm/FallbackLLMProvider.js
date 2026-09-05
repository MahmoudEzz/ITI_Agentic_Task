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

  // Failover only before the first delta has actually reached the caller —
  // once a chunk has been yielded, the caller (an SSE client, ultimately)
  // has already seen live output from that provider; silently restarting
  // from a different one at that point would emit a second, overlapping
  // stream rather than a clean handoff, so any failure past that point
  // propagates directly instead (ADR-0007).
  async *stream(request) {
    const failures = [];
    for (const { name, provider } of this.#providers) {
      let yieldedAny = false;
      try {
        for await (const event of provider.stream(request)) {
          yieldedAny = true;
          yield event;
        }
        return;
      } catch (error) {
        if (yieldedAny) throw error;
        failures.push(`${name}: ${error.message}`);
      }
    }
    throw new Error(`All LLM providers in the fallback chain failed — ${failures.join("; ")}`);
  }
}
