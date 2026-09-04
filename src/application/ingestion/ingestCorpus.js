// Batch orchestrator: reads a corpus manifest (see corpus/manifest.json's
// schema) and calls ingestDocument once per entry. A CV's candidateId is
// resolved (creating the Candidate row on first sight) before ingestion,
// since chunks.candidate_id is a foreign key — the row must exist first.
//
// Each entry's failure is caught by ingestDocument itself and returned as a
// status, never thrown, so one bad document never aborts the batch (FR-1).
const CV_HANDLE_PATTERN = /^cv-(\d+)/;

export function createIngestCorpusUseCase({ ingestDocument, candidateRepository }) {
  return async function ingestCorpus(manifest, { resolvePath, createdBy = "corpus-seed" } = {}) {
    const results = [];

    for (const entry of manifest.documents) {
      let candidateId = null;

      if (entry.type === "cv" && entry.candidateName) {
        const match = entry.id.match(CV_HANDLE_PATTERN);
        if (match) {
          const handle = `CAND-${match[1]}`;
          let candidate = await candidateRepository.findByHandle(handle);
          if (!candidate) {
            candidate = await candidateRepository.create({
              id: handle.toLowerCase(),
              handle,
              fullName: entry.candidateName,
              createdBy,
            });
          }
          candidateId = candidate.id;
        }
      }

      const result = await ingestDocument({
        documentId: entry.id,
        sourcePath: resolvePath(entry.path),
        sourceFormat: entry.format,
        type: entry.type,
        title: entry.id,
        createdBy,
        candidateId,
      });

      results.push({ id: entry.id, ...result });
    }

    return results;
  };
}

export function summarizeIngestResults(results) {
  const summary = { indexed: 0, skipped: 0, needs_ocr: 0, failed: 0 };
  for (const result of results) {
    summary[result.status] = (summary[result.status] ?? 0) + 1;
  }
  return summary;
}
