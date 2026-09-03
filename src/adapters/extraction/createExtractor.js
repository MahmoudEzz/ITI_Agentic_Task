import { TxtExtractor } from "./TxtExtractor.js";
import { DocxExtractor } from "./DocxExtractor.js";
import { PdfExtractor } from "./PdfExtractor.js";
import { NotFoundError } from "../../domain/errors/index.js";

const EXTRACTORS = Object.freeze({
  txt: () => new TxtExtractor(),
  docx: () => new DocxExtractor(),
  pdf: () => new PdfExtractor(),
});

export function createExtractor(sourceFormat) {
  const factory = EXTRACTORS[sourceFormat];
  if (!factory) throw new NotFoundError("Extractor", sourceFormat);
  return factory();
}

export const SUPPORTED_EXTRACTION_FORMATS = Object.freeze(Object.keys(EXTRACTORS));
