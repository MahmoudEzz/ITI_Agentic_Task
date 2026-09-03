import mammoth from "mammoth";
import { ExtractionPort } from "../../application/ports/ExtractionPort.js";
import { estimatePageCountFromWords } from "./estimatePageCount.js";

export class DocxExtractor extends ExtractionPort {
  async extract(sourcePath) {
    const { value: text } = await mammoth.extractRawText({ path: sourcePath });
    return {
      text,
      pageCount: estimatePageCountFromWords(text),
      pageCountMethod: "estimated_500_words_per_page",
      needsOcr: false, // a .docx always has a real text layer by construction
    };
  }
}
