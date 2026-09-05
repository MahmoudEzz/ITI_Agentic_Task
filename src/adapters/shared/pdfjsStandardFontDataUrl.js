import path from "node:path";
import { fileURLToPath } from "node:url";

// Shared by PdfExtractor.js and TesseractOcrAdapter.js — both call
// pdfjs-dist's getDocument() and both need this to avoid its
// "Ensure that the standardFontDataUrl API parameter is provided" warning
// (and, for the OCR path, to render non-embedded standard fonts correctly
// rather than falling back to a generic substitute glyph shape).
export const PDFJS_STANDARD_FONT_DATA_URL = `${path.dirname(fileURLToPath(import.meta.resolve("pdfjs-dist/package.json")))}/standard_fonts/`;
