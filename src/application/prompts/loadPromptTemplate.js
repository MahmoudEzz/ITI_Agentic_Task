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

  return { ...frontmatter, template: body.trim() };
}
