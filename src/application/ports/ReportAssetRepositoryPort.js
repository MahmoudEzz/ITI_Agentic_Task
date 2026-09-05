// Port (interface) — implemented by src/adapters/relational/KnexReportAssetRepository.js.
export class ReportAssetRepositoryPort {
  async create(_asset) {
    throw new Error("ReportAssetRepositoryPort.create not implemented");
  }

  async findById(_id) {
    throw new Error("ReportAssetRepositoryPort.findById not implemented");
  }
}
