import { buildContainer, destroyContainer } from "../src/infra/config/container.js";

function parseArgs(argv) {
  const args = { filters: {} };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--candidate") args.filters.candidateHandle = argv[++i];
    else if (arg === "--document-type") args.filters.documentType = argv[++i];
    else if (arg === "--section") args.filters.section = argv[++i];
    else if (arg === "--top-k") args.filters.topK = Number(argv[++i]);
    else rest.push(arg);
  }
  args.question = rest.join(" ");
  return args;
}

async function main() {
  const { question, filters } = parseArgs(process.argv.slice(2));
  if (!question) {
    console.error('Usage: npm run ask -- "your question" [--candidate CAND-001] [--document-type cv] [--section Experience] [--top-k 8]');
    process.exit(1);
  }

  const container = buildContainer();
  const answerQuestion = container.resolve("answerQuestion");

  // No HTTP request exists to generate one at ingress (FR-9) — the CLI is
  // its own ingress point, so it generates its own correlation id here.
  const correlationId = crypto.randomUUID();
  const result = await answerQuestion({ question, ...filters, correlationId });

  if (result.refused) {
    console.log(`Refused: ${result.refusalReason} — insufficient evidence in the corpus to answer this question.`);
  } else {
    console.log(`Answer:\n${result.answer}\n`);
    console.log("Citations:");
    for (const citation of result.citations) {
      const meta = [citation.section, citation.page ? `page ${citation.page}` : null].filter(Boolean).join(", ");
      console.log(`  - chunk ${citation.chunkId} (document: ${citation.documentId}${meta ? `, ${meta}` : ""})`);
    }
  }

  await destroyContainer(container);
  process.exit(0);
}

main().catch((error) => {
  console.error("ask run crashed:", error);
  process.exit(1);
});
