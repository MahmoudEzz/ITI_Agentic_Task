import { DocumentGeneratorPort } from "../../application/ports/DocumentGeneratorPort.js";
import { NotFoundError } from "../../domain/errors/index.js";
import { renderDocx } from "./renderDocx.js";
import { renderPdf } from "./renderPdf.js";

const RENDERERS = Object.freeze({ docx: renderDocx, pdf: renderPdf });

export class ReportDocumentGenerator extends DocumentGeneratorPort {
  async generate(format, reportContent) {
    const render = RENDERERS[format];
    if (!render) throw new NotFoundError("Report renderer", format);
    return render(reportContent);
  }
}
