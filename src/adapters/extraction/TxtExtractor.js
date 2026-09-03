import { readFile } from "node:fs/promises";
import { ExtractionPort } from "../../application/ports/ExtractionPort.js";
import { estimatePageCountFromWords } from "./estimatePageCount.js";

export class TxtExtractor extends ExtractionPort {
  async extract(sourcePath) {
    const text = await readFile(sourcePath, "utf-8");
    return {
      text,
      pageCount: estimatePageCountFromWords(text),
      pageCountMethod: "estimated_500_words_per_page",
      needsOcr: false,
    };
  }
}
