import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { loadPromptTemplate } from "../../src/application/prompts/loadPromptTemplate.js";

function withTempPromptFile(content, run) {
  const dir = mkdtempSync(path.join(tmpdir(), "prompt-test-"));
  const filePath = path.join(dir, "test.md");
  writeFileSync(filePath, content);
  try {
    return run(filePath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("parses frontmatter fields and trims the template body", () => {
  withTempPromptFile("---\nid: my-prompt\nversion: 1\nagent: qa\n---\n\nHello {{name}}.\n", (filePath) => {
    const result = loadPromptTemplate(filePath);
    assert.equal(result.id, "my-prompt");
    assert.equal(result.version, "1");
    assert.equal(result.agent, "qa");
    assert.equal(result.template, "Hello {{name}}.");
  });
});

test("throws a clear error when the frontmatter block is missing", () => {
  withTempPromptFile("Just a plain file with no frontmatter.\n", (filePath) => {
    assert.throws(() => loadPromptTemplate(filePath), /frontmatter/);
  });
});
