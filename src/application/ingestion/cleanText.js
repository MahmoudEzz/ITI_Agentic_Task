// The "clean" stage of extract -> clean -> chunk -> embed -> index (FR-1).
// Deliberately minimal: normalize line endings and collapse runs of 3+
// blank lines to a single one, so downstream chunking's blank-line-based
// heading detection isn't thrown off by extraction artifacts (mammoth/
// pdf-parse sometimes emit several consecutive blank lines). Does NOT strip
// or rewrite content — that would risk corrupting citation offsets that
// need to trace back to the original text.
export function cleanText(text) {
  return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}
