import { test } from "node:test";
import assert from "node:assert/strict";

import { detectSections } from "../../src/application/chunking/detectSections.js";
import { chunkExperienceEntries } from "../../src/application/chunking/chunkExperienceEntries.js";
import { chunkByTokens } from "../../src/application/chunking/chunkByTokens.js";
import { chunkDocument, CHUNKER_VERSION } from "../../src/application/chunking/chunkDocument.js";
import { countTokens } from "../../src/application/chunking/tokenizer.js";

test("detectSections finds ALL CAPS and Title Case headings surrounded by blank lines", () => {
  const text = "SUMMARY\n\nExperienced engineer.\n\nEducation\n\nBSc Computer Science.\n";
  const sections = detectSections(text);
  assert.equal(sections.length, 2);
  assert.equal(sections[0].heading, "SUMMARY");
  assert.match(sections[0].content, /Experienced engineer/);
  assert.equal(sections[1].heading, "Education");
  assert.match(sections[1].content, /BSc Computer Science/);
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
  const text = "SUMMARY\n\nShort summary text.\n";
  const chunks = chunkDocument(text);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].section, "SUMMARY");
});

test("chunkDocument splits a long Experience section per job entry, not by token window", () => {
  const longBullets = "- Did a thing.\n".repeat(30);
  const text = [
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
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].section, "EXPERIENCE");
  assert.match(chunks[0].content, /Acme Corp/);
  assert.match(chunks[1].content, /Beta Inc/);
});

test("chunkDocument falls back to token windows for a long unstructured section", () => {
  const longProse = "This is a sentence about company policy. ".repeat(200);
  const text = `POLICY OVERVIEW\n\n${longProse}`;
  const chunks = chunkDocument(text);

  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.equal(chunk.section, "POLICY OVERVIEW");
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
