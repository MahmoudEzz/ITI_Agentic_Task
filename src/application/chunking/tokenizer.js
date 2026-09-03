import { getEncoding } from "js-tiktoken";

// cl100k_base is the encoding used by the models this repo's provider
// abstraction targets (GPT-3.5/4-family; close enough to Ollama/Gemini's
// actual tokenizers for chunk-sizing purposes — we're not billing against
// this count, just keeping chunks in a sane size band).
const encoding = getEncoding("cl100k_base");

export function countTokens(text) {
  return encoding.encode(text).length;
}

export function encodeText(text) {
  return encoding.encode(text);
}

export function decodeTokens(tokens) {
  return encoding.decode(tokens);
}

// Returns the character offset in `text` immediately after `tokenCount`
// tokens' worth of content, so callers can slice by character (preserving
// exact source offsets for citations) while sizing by token count.
export function charOffsetAfterTokens(text, tokenCount) {
  const tokens = encoding.encode(text);
  if (tokenCount >= tokens.length) return text.length;
  const decoded = encoding.decode(tokens.slice(0, tokenCount));
  return decoded.length;
}
