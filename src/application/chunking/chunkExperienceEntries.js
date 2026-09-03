// Splits an Experience section into one chunk per job entry, bounded by
// company/date-range detection (ADR-0001) — this is what keeps a single
// role's bullets together as one citable unit, instead of an arbitrary
// token window splitting "led a team of 5" from the role it happened in.
const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?";
const DATE_RANGE = new RegExp(
  `\\b(?:${MONTH}\\s+)?(?:\\d{4}|\\d{1,2}\\/\\d{4})\\s*(?:-|–|—|to)\\s*(?:${MONTH}\\s+)?(?:present|current|\\d{4}|\\d{1,2}\\/\\d{4})\\b`,
  "i",
);

function splitIntoParagraphs(text, baseOffset) {
  const paragraphs = [];
  let cursor = 0;

  for (const block of text.split(/\n\s*\n/)) {
    const start = text.indexOf(block, cursor);
    const end = start + block.length;
    if (block.trim().length > 0) {
      paragraphs.push({ text: block, startChar: baseOffset + start, endChar: baseOffset + end });
    }
    cursor = end;
  }

  return paragraphs;
}

// Returns null if no date-range pattern is found anywhere in the section —
// callers should fall back to chunkByTokens in that case, since this
// section apparently isn't a real per-job Experience list.
export function chunkExperienceEntries(sectionContent, { baseOffset = 0 } = {}) {
  const paragraphs = splitIntoParagraphs(sectionContent, baseOffset);
  if (!paragraphs.some((p) => DATE_RANGE.test(p.text))) return null;

  const entries = [];
  let current = null;

  for (const paragraph of paragraphs) {
    const startsNewEntry = DATE_RANGE.test(paragraph.text);
    if (startsNewEntry || !current) {
      if (current) entries.push(current);
      current = { content: paragraph.text, startChar: paragraph.startChar, endChar: paragraph.endChar };
    } else {
      current.content += "\n\n" + paragraph.text;
      current.endChar = paragraph.endChar;
    }
  }
  if (current) entries.push(current);

  return entries.map((entry) => ({
    content: entry.content,
    charRange: { start: entry.startChar, end: entry.endChar },
  }));
}
