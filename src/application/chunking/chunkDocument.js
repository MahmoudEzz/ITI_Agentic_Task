import { detectSections } from "./detectSections.js";
import { chunkExperienceEntries } from "./chunkExperienceEntries.js";
import { chunkByTokens } from "./chunkByTokens.js";
import { countTokens } from "./tokenizer.js";

// Bumping this forces re-chunking of already-ingested documents on the next
// `npm run ingest` (see Chunk.js's chunkerVersion field and the idempotent
// re-ingestion design) — any change to the chunking logic below should bump it.
export const CHUNKER_VERSION = "v1";

const MAX_SECTION_TOKENS = 400;

// Orchestrates the ADR-0001 chunking strategy: detect sections; chunk an
// Experience-like section per job entry; keep a short section as one chunk;
// fall back to the sliding token window for anything longer or unstructured.
// Returns [{ content, section, charRange }] — chunkerVersion, documentId,
// documentType etc. are stamped by the ingestion use case, not here, since
// this module has no notion of a document beyond its raw text.
export function chunkDocument(text) {
  const sections = detectSections(text);
  const chunks = [];

  for (const section of sections) {
    const isExperienceLike = section.heading && /experience|employment|work history/i.test(section.heading);

    if (isExperienceLike) {
      const entries = chunkExperienceEntries(section.content, { baseOffset: section.startChar });
      if (entries) {
        for (const entry of entries) {
          chunks.push({ content: entry.content, section: section.heading, charRange: entry.charRange });
        }
        continue;
      }
      // No date-range pattern actually found despite the heading — fall
      // through to the same token-based handling as any other section.
    }

    if (countTokens(section.content) <= MAX_SECTION_TOKENS) {
      chunks.push({
        content: section.content,
        section: section.heading,
        charRange: { start: section.startChar, end: section.endChar },
      });
    } else {
      const subChunks = chunkByTokens(section.content, { baseOffset: section.startChar });
      for (const subChunk of subChunks) {
        chunks.push({ content: subChunk.content, section: section.heading, charRange: subChunk.charRange });
      }
    }
  }

  return chunks;
}
