import { encodeText, decodeTokens } from "./tokenizer.js";

const DEFAULT_MAX_TOKENS = 400;
const DEFAULT_OVERLAP_RATIO = 0.15;

// Sliding window over token boundaries, not characters — a fixed character
// window can split a word or multi-byte token awkwardly; token boundaries
// don't. Character offsets in the result are computed by decoding token
// prefixes, so callers still get exact citations into the original text
// (this is the fallback chunker per ADR-0001, used when a section has no
// further structure to exploit — e.g. unstructured prose in a policy doc).
export function chunkByTokens(text, { maxTokens = DEFAULT_MAX_TOKENS, overlapRatio = DEFAULT_OVERLAP_RATIO, baseOffset = 0 } = {}) {
  const tokens = encodeText(text);
  if (tokens.length === 0) return [];

  const overlapTokens = Math.round(maxTokens * overlapRatio);
  const step = maxTokens - overlapTokens;
  const chunks = [];

  for (let start = 0; start < tokens.length; start += step) {
    const end = Math.min(start + maxTokens, tokens.length);
    const charStart = start === 0 ? 0 : decodeTokens(tokens.slice(0, start)).length;
    const charEnd = decodeTokens(tokens.slice(0, end)).length;

    chunks.push({
      content: text.slice(charStart, charEnd),
      charRange: { start: baseOffset + charStart, end: baseOffset + charEnd },
    });

    if (end === tokens.length) break;
  }

  return chunks;
}
