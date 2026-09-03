import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Document, Packer, Paragraph } from "docx";
import { PDFDocument, StandardFonts } from "pdf-lib";

import { createExtractor, SUPPORTED_EXTRACTION_FORMATS } from "../../src/adapters/extraction/createExtractor.js";
import { NotFoundError } from "../../src/domain/errors/index.js";

let dir;
let txtPath, docxPath, pdfWithTextPath, pdfBlankPath;

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "extraction-test-"));

  txtPath = path.join(dir, "sample.txt");
  await writeFile(txtPath, "Backend Engineer with 5 years of experience in distributed systems.".repeat(20));

  docxPath = path.join(dir, "sample.docx");
  const doc = new Document({
    sections: [{ children: [new Paragraph("Experienced software engineer specializing in cloud infrastructure.")] }],
  });
  await writeFile(docxPath, await Packer.toBuffer(doc));

  pdfWithTextPath = path.join(dir, "sample-with-text.pdf");
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  page.drawText("This PDF has a real, selectable text layer describing relevant work experience.", {
    x: 50,
    y: 700,
    size: 12,
    font,
  });
  await writeFile(pdfWithTextPath, await pdfDoc.save());

  pdfBlankPath = path.join(dir, "sample-blank.pdf");
  const blankDoc = await PDFDocument.create();
  blankDoc.addPage(); // no drawText call at all — simulates a scanned/image-only page
  await writeFile(pdfBlankPath, await blankDoc.save());
});

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("createExtractor throws NotFoundError for an unsupported format", () => {
  assert.throws(() => createExtractor("rtf"), NotFoundError);
});

test("SUPPORTED_EXTRACTION_FORMATS lists exactly txt, docx, pdf", () => {
  assert.deepEqual([...SUPPORTED_EXTRACTION_FORMATS].sort(), ["docx", "pdf", "txt"]);
});

test("TxtExtractor returns the raw file content and an estimated page count", async () => {
  const extractor = createExtractor("txt");
  const result = await extractor.extract(txtPath);
  assert.match(result.text, /Backend Engineer/);
  assert.equal(result.needsOcr, false);
  assert.equal(result.pageCountMethod, "estimated_500_words_per_page");
  assert.ok(result.pageCount >= 1);
});

test("DocxExtractor extracts real text from a .docx file and never flags needsOcr", async () => {
  const extractor = createExtractor("docx");
  const result = await extractor.extract(docxPath);
  assert.match(result.text, /cloud infrastructure/);
  assert.equal(result.needsOcr, false);
});

test("PdfExtractor extracts real text and reports the actual page count for a native-text PDF", async () => {
  const extractor = createExtractor("pdf");
  const result = await extractor.extract(pdfWithTextPath);
  assert.match(result.text, /selectable text layer/);
  assert.equal(result.pageCountMethod, "actual");
  assert.equal(result.pageCount, 1);
  assert.equal(result.needsOcr, false);
});

test("PdfExtractor flags needsOcr on a page with no text layer, instead of silently ingesting it empty", async () => {
  const extractor = createExtractor("pdf");
  const result = await extractor.extract(pdfBlankPath);
  assert.equal(result.needsOcr, true);
});
