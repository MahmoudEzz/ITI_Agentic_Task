import { test } from "node:test";
import assert from "node:assert/strict";

import {
  redactProtectedAttributes,
  redactEvidenceSnippets,
  PROTECTED_ATTRIBUTE_CATEGORIES,
} from "../../src/domain/services/redactProtectedAttributes.js";

test("a snippet with no protected-attribute language passes through unchanged with no audit entries", () => {
  const snippet = { text: "Led a team of 5 engineers shipping a payments platform.", sourceChunkId: "ch1" };
  const result = redactProtectedAttributes(snippet);
  assert.equal(result.snippet.text, snippet.text);
  assert.deepEqual(result.auditEntries, []);
});

test("gendered pronouns are redacted and logged as the gender category", () => {
  const snippet = { text: "She led a team of 5 engineers.", sourceChunkId: "ch2" };
  const result = redactProtectedAttributes(snippet);
  assert.match(result.snippet.text, /\[REDACTED:GENDER\]/);
  assert.equal(result.auditEntries.length, 1);
  assert.equal(result.auditEntries[0].category, "gender");
  assert.equal(result.auditEntries[0].action, "redact");
  assert.equal(result.auditEntries[0].sourceChunkId, "ch2");
});

test("two otherwise-identical snippets differing only by gendered pronoun redact to the identical string", () => {
  const withHe = redactProtectedAttributes({ text: "He led a team of 5 engineers.", sourceChunkId: "ch3" });
  const withShe = redactProtectedAttributes({ text: "She led a team of 5 engineers.", sourceChunkId: "ch3" });
  assert.equal(withHe.snippet.text, withShe.snippet.text);
});

test("marital status, religion, and nationality are each detected and redacted", () => {
  const marital = redactProtectedAttributes({ text: "She is married and manages a team.", sourceChunkId: "c" });
  assert.match(marital.snippet.text, /\[REDACTED:MARITAL_STATUS\]/);

  const religion = redactProtectedAttributes({ text: "As a practicing Muslim, led community volunteering.", sourceChunkId: "c" });
  assert.match(religion.snippet.text, /\[REDACTED:RELIGION\]/);

  const nationality = redactProtectedAttributes({ text: "Egyptian software engineer with 5 years experience.", sourceChunkId: "c" });
  assert.match(nationality.snippet.text, /\[REDACTED:NATIONALITY_OR_ETHNICITY\]/);
});

test("graduation-year, native-speaker, and career-gap proxies are detected", () => {
  const gradYear = redactProtectedAttributes({ text: "Graduated in 2015 with a CS degree, 8 years of backend experience since.", sourceChunkId: "c" });
  assert.match(gradYear.snippet.text, /\[REDACTED:GRADUATION_YEAR_PROXY\]/);
  // Duration ("8 years of backend experience") is job-relevant and must survive redaction.
  assert.match(gradYear.snippet.text, /8 years of backend experience/);

  const nativeSpeaker = redactProtectedAttributes({
    text: "Native English speaker with strong technical writing skills, produced comprehensive API documentation used company-wide.",
    sourceChunkId: "c",
  });
  assert.match(nativeSpeaker.snippet.text, /\[REDACTED:NATIVE_SPEAKER_PROXY\]/);

  const careerGap = redactProtectedAttributes({ text: "Took parental leave in 2019, returned to lead the platform team.", sourceChunkId: "c" });
  assert.match(careerGap.snippet.text, /\[REDACTED:CAREER_GAP_PROXY\]/);
});

test("a snippet that is mostly protected-attribute content is dropped entirely, not partially redacted", () => {
  const snippet = { text: "Married Egyptian Muslim woman, 34 years old.", sourceChunkId: "ch9" };
  const result = redactProtectedAttributes(snippet);
  assert.equal(result.snippet, null);
  assert.ok(result.auditEntries.length > 0);
  assert.ok(result.auditEntries.every((e) => e.action === "drop"));
  assert.ok(result.auditEntries.every((e) => e.sourceChunkId === "ch9"));
});

test("audit entries never store the matched text itself, only category and position", () => {
  const result = redactProtectedAttributes({ text: "She is married.", sourceChunkId: "ch10" });
  for (const entry of result.auditEntries) {
    assert.equal(Object.prototype.hasOwnProperty.call(entry, "text"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(entry, "matchedText"), false);
  }
});

test("redactEvidenceSnippets filters out dropped snippets while preserving the full audit trail", () => {
  const snippets = [
    { text: "Led a team of 5 engineers.", sourceChunkId: "keep" },
    { text: "Married Egyptian Muslim woman, 34 years old.", sourceChunkId: "drop" },
  ];
  const { snippets: kept, auditEntries } = redactEvidenceSnippets(snippets);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].sourceChunkId, "keep");
  assert.ok(auditEntries.some((e) => e.sourceChunkId === "drop" && e.action === "drop"));
});

test("PROTECTED_ATTRIBUTE_CATEGORIES matches the closed list documented in docs/SECURITY.md", () => {
  const categories = PROTECTED_ATTRIBUTE_CATEGORIES.map((c) => c.category).sort();
  assert.deepEqual(categories, [
    "age_or_dob",
    "career_gap_proxy",
    "disability",
    "gender",
    "graduation_year_proxy",
    "marital_status",
    "nationality_or_ethnicity",
    "native_speaker_proxy",
    "photo",
    "religion",
  ]);
});
