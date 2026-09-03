// Shared by extractors with no native page concept (txt, docx) — matches the
// ~500-words/page convention already used in docs/BRD.md's corpus plan, so a
// document's page count is estimated the same way everywhere it's reported.
export function estimatePageCountFromWords(text) {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / 500));
}
