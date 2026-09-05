// Pure, deterministic redaction — no LLM call, no network, ever. This is the
// point of the bias-safety design (docs/SECURITY.md, ADR-0006): the
// exclusion cannot be prompted around because it happens before an LLM ever
// sees the text. Regex/keyword matching has real recall limits (documented
// candidly in docs/SECURITY.md) — this is a mitigation, not a guarantee.
//
// Audit entries store the matched span's *position*, not its text, so the
// audit trail itself never becomes a second copy of the PII it's proving was
// removed. Anyone auditing a decision can still locate the exact span in the
// original chunk via (sourceChunkId, start, end).

const DROP_RATIO_THRESHOLD = 0.4;

// Closed, documented list — mirrors docs/SECURITY.md exactly. Direct
// attributes and their proxies are both in scope (see ADR-0006): a proxy is
// flagged with the same weight as the direct attribute it stands in for.
const PATTERNS = Object.freeze([
  // --- direct attributes ---
  { category: "gender", kind: "direct", regex: /\b(he|she|him|her|his|hers|himself|herself|Mr\.|Mrs\.|Ms\.|Miss)\b/gi },
  { category: "age_or_dob", kind: "direct", regex: /\b(\d{1,2}\s*(years?\s*old|y\.?o\.?)|born\s+(in|on)\s+\d{4}|\b(19|20)\d{2}[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b)\b/gi },
  { category: "marital_status", kind: "direct", regex: /\b(married|single|divorced|widowed|spouse|husband|wife)\b/gi },
  { category: "religion", kind: "direct", regex: /\b(muslim|islam|christian|christianity|catholic|jewish|judaism|hindu|hinduism|buddhist|buddhism|atheist|sikh)\b/gi },
  {
    category: "nationality_or_ethnicity",
    kind: "direct",
    regex: /\b(egyptian|american|british|indian|pakistani|nigerian|french|german|chinese|filipino|saudi|emirati|jordanian|lebanese|syrian|moroccan|tunisian|algerian|sudanese)\b/gi,
  },
  { category: "disability", kind: "direct", regex: /\b(disability|disabled|wheelchair|visually impaired|hearing impaired|neurodivergent)\b/gi },
  { category: "photo", kind: "direct", regex: /\[(photo|image|headshot)\]|\.(jpe?g|png)\b/gi },

  // --- proxies ---
  { category: "graduation_year_proxy", kind: "proxy", regex: /\b(graduated\s+in\s+(19|20)\d{2}|class\s+of\s+(19|20)\d{2})\b/gi },
  { category: "native_speaker_proxy", kind: "proxy", regex: /\b(native\s+(english|arabic)?\s*speaker|mother\s+tongue)\b/gi },
  { category: "career_gap_proxy", kind: "proxy", regex: /\b(career\s+break|maternity\s+leave|paternity\s+leave|parental\s+leave|extended\s+leave|gap\s+year)\b/gi },
]);

function findMatches(text) {
  const matches = [];
  for (const { category, regex } of PATTERNS) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push({ category, start: match.index, end: match.index + match[0].length });
      if (match[0].length === 0) regex.lastIndex++; // guard against zero-width infinite loop
    }
  }
  return matches.sort((a, b) => a.start - b.start);
}

function redactedLength(matches) {
  // Non-overlapping char count covered by any match, for the drop-ratio check.
  let covered = 0;
  let cursor = 0;
  for (const { start, end } of matches) {
    const from = Math.max(start, cursor);
    if (end > from) covered += end - from;
    cursor = Math.max(cursor, end);
  }
  return covered;
}

function buildRedactedText(text, matches) {
  let result = "";
  let cursor = 0;
  for (const { category, start, end } of matches) {
    if (start < cursor) continue; // overlapping match already covered
    result += text.slice(cursor, start) + `[REDACTED:${category.toUpperCase()}]`;
    cursor = end;
  }
  result += text.slice(cursor);
  return result;
}

// snippet: { text, sourceChunkId }. Returns { snippet: {...}|null, auditEntries: [...] }.
// snippet is null when the drop-ratio threshold is exceeded — the whole
// snippet is discarded rather than left partially redacted and possibly
// still identifying.
export function redactProtectedAttributes(snippet, { at = new Date() } = {}) {
  const matches = findMatches(snippet.text);

  if (matches.length === 0) {
    return { snippet, auditEntries: [] };
  }

  const ratio = redactedLength(matches) / snippet.text.length;
  const categoriesFound = [...new Set(matches.map((m) => m.category))];

  if (ratio > DROP_RATIO_THRESHOLD) {
    return {
      snippet: null,
      auditEntries: categoriesFound.map((category) => ({
        sourceChunkId: snippet.sourceChunkId,
        category,
        action: "drop",
        at,
      })),
    };
  }

  return {
    snippet: { ...snippet, text: buildRedactedText(snippet.text, matches) },
    auditEntries: matches.map(({ category, start, end }) => ({
      sourceChunkId: snippet.sourceChunkId,
      category,
      action: "redact",
      start,
      end,
      at,
    })),
  };
}

export function redactEvidenceSnippets(snippets, options) {
  const redactedSnippets = [];
  const auditEntries = [];
  for (const snippet of snippets) {
    const result = redactProtectedAttributes(snippet, options);
    if (result.snippet) redactedSnippets.push(result.snippet);
    auditEntries.push(...result.auditEntries);
  }
  return { snippets: redactedSnippets, auditEntries };
}

export const PROTECTED_ATTRIBUTE_CATEGORIES = Object.freeze(PATTERNS.map((p) => Object.freeze({ category: p.category, kind: p.kind })));
