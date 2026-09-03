// Structure-aware section detection (ADR-0001): a heading is a short,
// standalone line — ALL CAPS or Title Case, no trailing period, on its own
// line surrounded by blank lines (or the very start/end of the document).
// This is a heuristic, not a parser — it's deliberately permissive because
// the corpus (CVs, job descriptions, policies) doesn't share one formatting
// convention, and a document that matches nothing here still gets chunked,
// just by the token-based fallback treating it as a single unheaded section.
const MAX_HEADING_WORDS = 6;
const MAX_HEADING_LENGTH = 50;
const LOWERCASE_CONNECTORS = new Set(["of", "and", "the", "for", "in", "to", "a", "an", "&"]);

function isHeadingCandidate(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > MAX_HEADING_LENGTH) return false;
  if (trimmed.endsWith(".")) return false;

  const words = trimmed.replace(/:$/, "").split(/\s+/);
  if (words.length > MAX_HEADING_WORDS) return false;

  const isAllCaps = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
  const isTitleCase = words.every((word) => /^[A-Z]/.test(word) || LOWERCASE_CONNECTORS.has(word.toLowerCase()));

  return isAllCaps || isTitleCase;
}

// Returns [{ heading: string|null, content: string, startChar, endChar }].
// `heading` is null for any leading content before the first detected
// heading (or for the entire document, if no heading is ever detected).
export function detectSections(text) {
  const lines = text.split("\n");
  const sections = [];
  let currentHeading = null;
  let currentStart = 0;
  let cursor = 0;

  const flush = (endChar) => {
    const content = text.slice(currentStart, endChar);
    if (content.trim().length > 0) {
      sections.push({ heading: currentHeading, content, startChar: currentStart, endChar });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = cursor;
    const lineEnd = cursor + line.length;
    const prevLine = i > 0 ? lines[i - 1] : "";
    const nextLine = i < lines.length - 1 ? lines[i + 1] : "";
    const isSurroundedByBlankOrEdge = (i === 0 || prevLine.trim() === "") && (i === lines.length - 1 || nextLine.trim() === "");

    if (isSurroundedByBlankOrEdge && isHeadingCandidate(line)) {
      flush(lineStart);
      currentHeading = line.trim().replace(/:$/, "");
      currentStart = lineEnd + 1; // skip past this heading line
    }

    cursor = lineEnd + 1; // +1 for the newline consumed by split("\n")
  }

  flush(text.length);
  return sections;
}
