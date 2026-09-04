// Structure-aware section detection (ADR-0001): a heading is a short,
// standalone line — ALL CAPS or Title Case, no trailing period — preceded by
// an actual blank line. Only the preceding side is required: real CVs in the
// corpus commonly put a blank line *before* a heading but not after it (e.g.
// "SUMMARY\nBackend engineer with..." with no blank line in between) —
// requiring blank-on-both-sides was tested against the actual corpus and
// silently missed SUMMARY/EDUCATION/SKILLS headings in a real CV, catching
// only EXPERIENCE (which happened to have a blank line on both sides).
//
// Deliberately NOT treating the start of the document as "preceded by a
// blank line": a CV's very first line is almost always a name/title (e.g.
// "AHMED YOUSSEF", two title-case words), which otherwise passes the
// Title-Case/ALL-CAPS check and gets misread as a section heading — also
// found by testing against real corpus content, not assumed. The cost is
// that a document genuinely opening with a heading on line one won't be
// detected as such; its content just stays in the leading heading:null
// section, which the fallback chunker still handles correctly.
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
  // A job-entry title line ("Senior Engineer, Acme Corp") is title-case and
  // comma-separated — real section headings essentially never contain a
  // comma. Found by testing chunkExperienceEntries' own fixtures against
  // detectSections: without this, such a line got misread as a new
  // top-level heading, fragmenting the Experience section it belongs to.
  if (trimmed.includes(",")) return false;

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
    const isPrecededByBlank = i > 0 && lines[i - 1].trim() === "";

    if (isPrecededByBlank && isHeadingCandidate(line)) {
      flush(lineStart);
      currentHeading = line.trim().replace(/:$/, "");
      currentStart = lineEnd + 1; // skip past this heading line
    }

    cursor = lineEnd + 1; // +1 for the newline consumed by split("\n")
  }

  flush(text.length);
  return sections;
}
