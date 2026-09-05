import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sniffFileType } from "../../src/domain/services/sniffFileType.js";
import { validateUpload } from "../../src/application/ingestion/validateUpload.js";
import { ValidationError } from "../../src/domain/errors/index.js";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("sniffFileType detects a real corpus PDF by magic bytes", () => {
  const buffer = readFileSync(path.join(repoRoot, "corpus/cvs/cv-002-sara-mansour.pdf"));
  assert.equal(sniffFileType(buffer), "pdf");
});

test("sniffFileType detects a real corpus DOCX by its zip signature", () => {
  const buffer = readFileSync(path.join(repoRoot, "corpus/cvs/cv-003-omar-farouk.docx"));
  assert.equal(sniffFileType(buffer), "docx");
});

test("sniffFileType detects a real corpus plain-text CV", () => {
  const buffer = readFileSync(path.join(repoRoot, "corpus/cvs/cv-015-youssef-adly.txt"));
  assert.equal(sniffFileType(buffer), "txt");
});

test("sniffFileType returns unknown for binary content with no recognized magic bytes and NUL bytes present", () => {
  const buffer = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0x00, 0x10]);
  assert.equal(sniffFileType(buffer), "unknown");
});

test("validateUpload rejects a real PDF disguised with a declared sourceFormat of txt", () => {
  const fileBuffer = readFileSync(path.join(repoRoot, "corpus/cvs/cv-002-sara-mansour.pdf"));
  assert.throws(() => validateUpload({ sourceFormat: "txt", fileBuffer, maxSizeBytes: 1_000_000 }), ValidationError);
});

test("validateUpload rejects binary content mislabeled as any declared format (not just extension trust)", () => {
  const fileBuffer = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0x00, 0x10, 0x00, 0x00]);
  assert.throws(() => validateUpload({ sourceFormat: "txt", fileBuffer, maxSizeBytes: 1_000_000 }), ValidationError);
});

test("validateUpload rejects an upload exceeding the configured size cap even when the content type matches", () => {
  const fileBuffer = readFileSync(path.join(repoRoot, "corpus/cvs/cv-015-youssef-adly.txt"));
  assert.throws(() => validateUpload({ sourceFormat: "txt", fileBuffer, maxSizeBytes: 10 }), ValidationError);
});

test("validateUpload accepts a real, correctly-labeled corpus document under the size cap", () => {
  const fileBuffer = readFileSync(path.join(repoRoot, "corpus/cvs/cv-015-youssef-adly.txt"));
  assert.doesNotThrow(() => validateUpload({ sourceFormat: "txt", fileBuffer, maxSizeBytes: 1_000_000 }));
});
