import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildContainer, destroyContainer } from "../src/infra/config/container.js";
import { createIngestCorpusUseCase, summarizeIngestResults } from "../src/application/ingestion/ingestCorpus.js";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const manifestPath = path.join(repoRoot, "corpus", "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));

  const container = buildContainer();
  const ingestDocument = container.resolve("ingestDocument");
  const candidateRepository = container.resolve("candidateRepository");
  const ingestCorpus = createIngestCorpusUseCase({ ingestDocument, candidateRepository });

  console.log(`Ingesting ${manifest.documents.length} documents from ${manifestPath}...`);

  const results = await ingestCorpus(manifest, {
    resolvePath: (relativePath) => path.join(repoRoot, relativePath),
  });

  for (const result of results) {
    const detail = result.status === "failed" ? ` — ${result.error}` : "";
    console.log(`  [${result.status}] ${result.id}${detail}`);
  }

  const summary = summarizeIngestResults(results);
  console.log("\nSummary:", summary);

  await destroyContainer(container);

  process.exit(summary.failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Ingestion run crashed:", error);
  process.exit(1);
});
