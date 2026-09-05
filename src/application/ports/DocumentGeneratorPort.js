// Port (interface) — implemented by src/adapters/docgen/ReportDocumentGenerator.js.
// One port, one report-content model, dispatching internally by format —
// see ADR-0004 ("one report-content model, two renderers").
export class DocumentGeneratorPort {
  // reportContent: buildReportContent.js's output shape. Returns a Buffer.
  async generate(_format, _reportContent) {
    throw new Error("DocumentGeneratorPort.generate not implemented");
  }
}
