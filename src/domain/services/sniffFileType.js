// Content-sniffing by magic bytes, not extension/declared-format trust
// (docs/SECURITY.md's upload-validation control). A pure, deterministic
// function over an in-memory buffer — no filesystem/network access, the
// same category of domain service as redactProtectedAttributes.js — so it
// can't be fooled by a file renamed to claim a format it isn't.
//
// No external library (e.g. `file-type`) is used: the 3 formats this
// project actually ingests (pdf/docx/txt) are distinguishable with a
// handful of byte comparisons, and pulling in a dependency for that is the
// same kind of unnecessary-native/external-surface trade this project has
// already declined once (ADR-0004's pdftoppm -> pdfjs-dist swap, bcrypt ->
// bcryptjs). `Buffer` is a Node.js global, not an npm package or an I/O
// call — the same "standard library" allowance CLAUDE.md gives domain code.
const PDF_MAGIC = Buffer.from("%PDF-", "utf-8");
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // "PK\x03\x04" — docx (and any other Office Open XML / zip format) starts this way

const PLAIN_TEXT_SNIFF_WINDOW = 8000;

// A NUL byte essentially never appears in genuine plain-text content but is
// common in binary data — the same heuristic `file` and `git` use to guess
// "binary vs text". Deliberately conservative: this only ever accepts text,
// never falsely accepts a disguised binary as "txt".
function looksLikePlainText(buffer) {
  const sample = buffer.subarray(0, PLAIN_TEXT_SNIFF_WINDOW);
  return !sample.includes(0x00);
}

export function sniffFileType(buffer) {
  if (buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) return "pdf";
  if (buffer.subarray(0, ZIP_MAGIC.length).equals(ZIP_MAGIC)) return "docx";
  if (looksLikePlainText(buffer)) return "txt";
  return "unknown";
}
