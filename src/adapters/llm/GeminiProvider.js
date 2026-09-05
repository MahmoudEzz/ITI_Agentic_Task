import { GoogleGenAI } from "@google/genai";
import { LLMProviderPort } from "../../application/ports/LLMProviderPort.js";

export class GeminiProvider extends LLMProviderPort {
  #client;
  #model;

  constructor({ apiKey, model }) {
    super();
    this.#client = new GoogleGenAI({ apiKey });
    this.#model = model;
  }

  async complete({ system, prompt, schema } = {}) {
    const response = await this.#client.models.generateContent({
      model: this.#model,
      contents: prompt,
      config: {
        ...(system ? { systemInstruction: system } : {}),
        ...(schema ? { responseMimeType: "application/json", responseSchema: schema } : {}),
      },
    });

    // usageMetadata is Gemini's own real token counts for this call
    // (FR-9's token accounting) — not estimated client-side.
    return {
      text: response.text,
      tokensIn: response.usageMetadata?.promptTokenCount ?? null,
      tokensOut: response.usageMetadata?.candidatesTokenCount ?? null,
    };
  }
}
