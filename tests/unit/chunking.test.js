import { test } from "node:test";
import assert from "node:assert/strict";

import { detectSections } from "../../src/application/chunking/detectSections.js";
import { chunkExperienceEntries } from "../../src/application/chunking/chunkExperienceEntries.js";
import { chunkByTokens } from "../../src/application/chunking/chunkByTokens.js";
import { chunkDocument, CHUNKER_VERSION } from "../../src/application/chunking/chunkDocument.js";
import { countTokens } from "../../src/application/chunking/tokenizer.js";

test("detectSections finds ALL CAPS and Title Case headings surrounded by blank lines", () => {
  const text = "Jordan Example\n\nSUMMARY\n\nExperienced engineer.\n\nEducation\n\nBSc Computer Science.\n";
  const sections = detectSections(text);
  assert.equal(sections.length, 3);
  assert.equal(sections[0].heading, null);
  assert.equal(sections[1].heading, "SUMMARY");
  assert.match(sections[1].content, /Experienced engineer/);
  assert.equal(sections[2].heading, "Education");
  assert.match(sections[2].content, /BSc Computer Science/);
});

test("detectSections finds a heading with a blank line before it but NOT after — a real pattern found in the actual corpus", () => {
  // Regression test: an earlier version required blank-or-edge on both
  // sides, which silently missed SUMMARY/EDUCATION/SKILLS headings in a
  // real corpus CV (only EXPERIENCE happened to have a trailing blank line
  // too, so it was the only section detected). Found by running against
  // real corpus content, not by a synthetic fixture — see PR discussion.
  const text = "Name Here\n\nSUMMARY\nExperienced engineer with a strong track record.\n\nSKILLS\nJavaScript, Node.js, PostgreSQL.\n";
  const sections = detectSections(text);
  assert.equal(sections.length, 3);
  assert.equal(sections[0].heading, null);
  assert.equal(sections[1].heading, "SUMMARY");
  assert.match(sections[1].content, /Experienced engineer/);
  assert.equal(sections[2].heading, "SKILLS");
  assert.match(sections[2].content, /JavaScript, Node\.js/);
});

test("detectSections does not mistake a job-entry title line for a new heading", () => {
  // Regression test: "Senior Engineer, Acme Corp" is title-case and was
  // preceded by a blank line (right after the EXPERIENCE heading), so it
  // passed the original heuristic and fragmented the Experience section —
  // found via chunkDocument's own integration test, not assumed in advance.
  const text = "Jordan Example\n\nEXPERIENCE\n\nSenior Engineer, Acme Corp\nJan 2020 - Present\n- Did a thing.\n";
  const sections = detectSections(text);
  assert.equal(sections.length, 2);
  assert.equal(sections[1].heading, "EXPERIENCE");
  assert.match(sections[1].content, /Senior Engineer, Acme Corp/);
});

test("detectSections does not treat an ordinary sentence as a heading", () => {
  const text = "This is a normal sentence that ends with a period.\n\nAnd another one here too.";
  const sections = detectSections(text);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].heading, null);
});

test("detectSections preserves exact character offsets into the original text", () => {
  const text = "SUMMARY\n\nHello world.\n";
  const sections = detectSections(text);
  const section = sections[0];
  assert.equal(text.slice(section.startChar, section.endChar), section.content);
});

test("chunkExperienceEntries splits on date-range boundaries and groups bullets under the right entry", () => {
  const section = [
    "Senior Engineer, Acme Corp",
    "Jan 2020 - Present",
    "- Led backend platform migration",
    "- Mentored 3 junior engineers",
    "",
    "Software Engineer, Beta Inc",
    "2017 - 2019",
    "- Built the initial API",
  ].join("\n");

  const entries = chunkExperienceEntries(section);
  assert.equal(entries.length, 2);
  assert.match(entries[0].content, /Acme Corp/);
  assert.match(entries[0].content, /Led backend platform migration/);
  assert.doesNotMatch(entries[0].content, /Beta Inc/);
  assert.match(entries[1].content, /Beta Inc/);
});

test("chunkExperienceEntries returns null when no date-range pattern is present", () => {
  const section = "Worked on several projects over the years.\n\nEnjoyed collaborative environments.";
  assert.equal(chunkExperienceEntries(section), null);
});

test("chunkByTokens produces overlapping windows and the last chunk reaches the end of the text", () => {
  const text = "word ".repeat(1000).trim();
  const chunks = chunkByTokens(text, { maxTokens: 100, overlapRatio: 0.15 });

  assert.ok(chunks.length > 1);
  assert.equal(chunks.at(-1).charRange.end, text.length);

  // Consecutive chunks overlap: the next chunk's start is before the previous chunk's end.
  for (let i = 1; i < chunks.length; i++) {
    assert.ok(chunks[i].charRange.start < chunks[i - 1].charRange.end);
  }
});

test("chunkByTokens on empty text returns no chunks", () => {
  assert.deepEqual(chunkByTokens(""), []);
});

test("chunkByTokens honors baseOffset so char ranges map into a larger parent document", () => {
  const text = "some content here";
  const chunks = chunkByTokens(text, { baseOffset: 1000 });
  assert.equal(chunks[0].charRange.start, 1000);
});

test("chunkDocument keeps a short section as a single chunk", () => {
  const text = "Jordan Example\n\nSUMMARY\n\nShort summary text.\n";
  const chunks = chunkDocument(text);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].section, null);
  assert.equal(chunks[1].section, "SUMMARY");
});

test("chunkDocument splits a long Experience section per job entry, not by token window", () => {
  const longBullets = "- Did a thing.\n".repeat(30);
  const text = [
    "Jordan Example",
    "Software Engineer",
    "",
    "EXPERIENCE",
    "",
    "Senior Engineer, Acme Corp",
    "Jan 2020 - Present",
    longBullets,
    "Software Engineer, Beta Inc",
    "2017 - 2019",
    "- Built the initial API",
  ].join("\n");

  const chunks = chunkDocument(text);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].section, null); // the name/title block ahead of any heading
  assert.equal(chunks[1].section, "EXPERIENCE");
  assert.match(chunks[1].content, /Acme Corp/);
  assert.equal(chunks[2].section, "EXPERIENCE");
  assert.match(chunks[2].content, /Beta Inc/);
});

test("chunkDocument falls back to token windows for a long unstructured section", () => {
  const longProse = "This is a sentence about company policy. ".repeat(200);
  const text = `Company Handbook\n\nPOLICY OVERVIEW\n\n${longProse}`;
  const chunks = chunkDocument(text);

  assert.ok(chunks.length > 2); // the title block, plus multiple token-window chunks
  const policyChunks = chunks.filter((c) => c.section === "POLICY OVERVIEW");
  assert.ok(policyChunks.length > 1);
  for (const chunk of policyChunks) {
    assert.ok(countTokens(chunk.content) <= 400);
  }
});

test("chunkDocument handles a document with no detectable sections at all", () => {
  const text = "Just a paragraph of plain, unheaded text without any headings whatsoever.";
  const chunks = chunkDocument(text);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].section, null);
});

test("CHUNKER_VERSION is a non-empty string, since it's what forces re-chunking on strategy changes", () => {
  assert.equal(typeof CHUNKER_VERSION, "string");
  assert.ok(CHUNKER_VERSION.length > 0);
});
