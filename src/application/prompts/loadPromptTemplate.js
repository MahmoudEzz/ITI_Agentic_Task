import { readFileSync } from "node:fs";

// Prompts are files (CLAUDE.md), never inline template strings in
// application/adapter code. Reading them via node:fs (standard library, not
// an SDK) mirrors ingestDocument.js's precedent of reading its own input
// files directly in application code — no port abstraction needed for a
// plain filesystem read of a static, repo-committed artifact.
//
// Frontmatter format is deliberately minimal (flat `key: value` lines
// between `---` markers) rather than pulling in a YAML dependency for
// three scalar fields.
//
// A body containing a literal `===USER===` line splits into `system`
// (static role/instructions, no untrusted content, no {{vars}}) and
// `template` (the part rendered with {{vars}}, where untrusted retrieved
// content actually goes) — passed to LLMProviderPort.complete({ system,
// prompt }) as genuinely separate channels, not concatenated into one
// string. This is real privilege separation (docs/SECURITY.md's "Strict
// privilege separation" row), not just an instruction embedded in the same
// prompt telling the model to please ignore embedded instructions. A file
// with no marker returns `system: null` and the whole body as `template`,
// unchanged from before this existed.
export function loadPromptTemplate(filePath) {
  const raw = readFileSync(filePath, "utf-8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error(`Prompt file ${filePath} is missing its --- frontmatter block`);
  }

  const [, frontmatterBlock, body] = match;
  const frontmatter = Object.fromEntries(
    frontmatterBlock
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const separatorIndex = line.indexOf(":");
        return [line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim()];
      }),
  );

  const USER_MARKER = "\n===USER===\n";
  const markerIndex = body.indexOf(USER_MARKER);
  if (markerIndex === -1) {
    return { ...frontmatter, system: null, template: body.trim() };
  }

  return {
    ...frontmatter,
    system: body.slice(0, markerIndex).trim(),
    template: body.slice(markerIndex + USER_MARKER.length).trim(),
  };
}
