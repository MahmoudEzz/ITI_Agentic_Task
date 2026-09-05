// FR-3's evaluation harness. Runs the golden set (corpus/golden-set.json)
// against the real /ask use case (createAnswerQuestionUseCase) and the real
// dev database — see docs/EVALUATION.md for which database this expects and
// why `npm run ingest` is a prerequisite.
//
// Deliberately does NOT invoke the screening workflow (runScreeningWorkflow)
// — a single screening run has been observed to take 30s-150s per candidate
// with real stalls (see docs/SYSTEM-DESIGN.md's gap table), which doesn't
// fit an eval loop meant to be re-run often while tuning. The bias
// name-swap invariance metric that *does* need the Rubric Scorer lives in
// tests/integration/rubricScorerNameSwapInvariance.test.js instead, run and
// reported separately (see docs/EVALUATION.md).
//
// No LLM-judge anywhere in this file (see docs/EVALUATION.md's harness
// design note) — every metric below is a deterministic string/threshold
// check, on purpose, for reproducibility and so it can be explained
// line-by-line when teaching this.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

import { buildContainer, destroyContainer } from "../src/infra/config/container.js";
import { decideRefusal } from "../src/domain/services/decideRefusal.js";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// The same word-overlap ratio a citing sentence's content words must clear
// against its cited chunk's content to count as grounded. Lexical overlap,
// not embedding cosine, deliberately (see docs/EVALUATION.md): computing a
// second embedding per answer sentence would add real per-case latency on a
// CPU-bound local model for a number that ends up harder to explain than a
// plain word-overlap ratio. Chosen by running the harness once and reading
// the actual per-sentence distribution it printed (see docs/EVALUATION.md's
// Baseline results) — not guessed in advance.
const GROUNDEDNESS_OVERLAP_THRESHOLD = 0.3;

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with", "at", "by", "is", "are", "was",
  "were", "be", "been", "being", "this", "that", "these", "those", "it", "its", "as", "from", "has", "have",
  "had", "not", "no", "do", "does", "did", "so", "than", "then", "also", "their", "his", "her", "they",
]);

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => !STOPWORDS.has(t));
}

function overlapRatio(sentenceTokens, chunkTokens) {
  if (sentenceTokens.length === 0) return null;
  const chunkSet = new Set(chunkTokens);
  const matched = sentenceTokens.filter((t) => chunkSet.has(t)).length;
  return matched / sentenceTokens.length;
}

// Splits the model's answer into sentences and, for every sentence carrying
// a [n] marker, checks lexical overlap against chunks[n-1] — the same
// ordered chunk list buildContextBlock() numbered when the real call built
// its prompt (see answerQuestion.js). This harness re-runs retrieval itself
// with identical parameters (see retrievalDiagnostic below) rather than
// trusting the use case's own AnswerSchema.citations, specifically so it
// can grade *every* cited sentence's actual supporting text, not just the
// deduplicated citation list the schema exposes to a caller.
function computeGroundedness(answerText, chunks) {
  const sentences = answerText.split(/(?<=[.!?])\s+/).filter(Boolean);
  const perCitation = [];

  for (const sentence of sentences) {
    const markers = [...sentence.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
    if (markers.length === 0) continue;
    const sentenceTokens = tokenize(sentence.replace(/\[\d+\]/g, ""));
    for (const marker of markers) {
      const chunk = chunks[marker - 1];
      if (!chunk) {
        perCitation.push({ marker, documentId: null, overlap: 0, grounded: false, sentence });
        continue;
      }
      const overlap = overlapRatio(sentenceTokens, tokenize(chunk.content));
      perCitation.push({
        marker,
        documentId: chunk.documentId,
        overlap,
        grounded: overlap !== null && overlap >= GROUNDEDNESS_OVERLAP_THRESHOLD,
        sentence,
      });
    }
  }

  return {
    perCitation,
    groundedRatio: perCitation.length ? perCitation.filter((c) => c.grounded).length / perCitation.length : null,
  };
}

// Independent, deterministic retrieval pass with the exact same parameters
// the real answerQuestion() call uses internally — see the module doc
// comment on why the harness needs this separately: it's what lets a false
// refusal be attributed to "retrieval genuinely found nothing" vs "the
// model just didn't cite a marker" (see docs/EVALUATION.md's Failure
// analysis — this distinction turned out to matter a lot in practice).
async function retrievalDiagnostic({ embeddingProvider, vectorStore, candidateRepository, refusalThreshold, defaultTopK }, { question, filters }) {
  let candidateId;
  if (filters.candidateHandle) {
    const candidate = await candidateRepository.findByHandle(filters.candidateHandle);
    candidateId = candidate?.id;
  }
  const [embedding] = await embeddingProvider.embed([question]);
  const chunks = await vectorStore.hybridSearch(question, embedding, {
    topK: filters.topK ?? defaultTopK,
    candidateId,
    documentType: filters.documentType,
    section: filters.section,
  });
  return { chunks, refusal: decideRefusal(chunks, { threshold: refusalThreshold }) };
}

async function runCase(deps, testCase) {
  const filters = testCase.filters ?? {};
  const correlationId = crypto.randomUUID();

  const diagnostic = await retrievalDiagnostic(deps, { question: testCase.question, filters });
  const retrievedDocumentIds = [...new Set(diagnostic.chunks.map((c) => c.documentId))];
  const hit =
    testCase.expectedDocumentIds.length === 0
      ? null
      : testCase.expectedDocumentIds.some((id) => retrievedDocumentIds.includes(id));

  const answer = await deps.answerQuestion({ question: testCase.question, ...filters, correlationId });

  let falseRefusalCause = null;
  if (answer.refused && testCase.expectedRefusal === false) {
    falseRefusalCause = diagnostic.refusal.refused ? "retrieval_insufficient" : "citation_omitted_by_model";
  }

  let groundedness = null;
  if (!answer.refused) {
    groundedness = computeGroundedness(answer.answer, diagnostic.chunks);
  }

  let forbiddenPhraseHit = null;
  if (testCase.forbiddenPhrases && !answer.refused) {
    forbiddenPhraseHit = testCase.forbiddenPhrases.find((p) => new RegExp(p, "i").test(answer.answer ?? "")) ?? null;
  }

  return {
    id: testCase.id,
    category: testCase.category,
    manualReview: Boolean(testCase.manualReview),
    question: testCase.question,
    expectedRefusal: testCase.expectedRefusal,
    actualRefusal: answer.refused,
    refusalMatchesExpectation: answer.refused === testCase.expectedRefusal,
    falseRefusalCause,
    bestDenseSimilarity: diagnostic.refusal.bestDenseSimilarity,
    hit,
    retrievedDocumentIds,
    groundedRatio: groundedness?.groundedRatio ?? null,
    citationCount: groundedness?.perCitation.length ?? 0,
    forbiddenPhraseHit,
    answerPreview: (answer.answer ?? "").slice(0, 160),
  };
}

function summarize(results) {
  const autoScored = results.filter((r) => !r.manualReview);
  const manualReview = results.filter((r) => r.manualReview);

  const refusalPass = autoScored.filter((r) => r.refusalMatchesExpectation).length;
  const withExpectedHit = autoScored.filter((r) => r.hit !== null);
  const hitPass = withExpectedHit.filter((r) => r.hit).length;
  const withCitations = autoScored.filter((r) => r.citationCount > 0);
  const groundedRatios = withCitations.map((r) => r.groundedRatio).filter((r) => r !== null);
  const meanGroundedness = groundedRatios.length ? groundedRatios.reduce((a, b) => a + b, 0) / groundedRatios.length : null;

  return {
    totalCases: results.length,
    autoScoredCases: autoScored.length,
    manualReviewCases: manualReview.length,
    refusalCorrectness: { pass: refusalPass, total: autoScored.length, rate: autoScored.length ? refusalPass / autoScored.length : null },
    retrievalHitRate: { pass: hitPass, total: withExpectedHit.length, rate: withExpectedHit.length ? hitPass / withExpectedHit.length : null },
    groundedness: { meanRatio: meanGroundedness, casesWithCitations: withCitations.length, threshold: GROUNDEDNESS_OVERLAP_THRESHOLD },
    falseRefusals: autoScored.filter((r) => r.falseRefusalCause).map((r) => ({ id: r.id, cause: r.falseRefusalCause, bestDenseSimilarity: r.bestDenseSimilarity })),
  };
}

async function main() {
  const goldenSetPath = path.join(repoRoot, "corpus", "golden-set.json");
  const goldenSet = JSON.parse(await readFile(goldenSetPath, "utf-8"));

  const container = buildContainer();
  const config = container.resolve("config");
  const deps = {
    answerQuestion: container.resolve("answerQuestion"),
    embeddingProvider: container.resolve("embeddingProvider"),
    vectorStore: container.resolve("vectorStore"),
    candidateRepository: container.resolve("candidateRepository"),
    refusalThreshold: config.retrieval.refusalThreshold,
    defaultTopK: config.retrieval.topK,
  };

  console.log(`Running ${goldenSet.cases.length} golden-set cases against the real corpus...\n`);

  const results = [];
  for (const testCase of goldenSet.cases) {
    process.stdout.write(`  ${testCase.id} (${testCase.category})... `);
    const result = await runCase(deps, testCase);
    results.push(result);
    const flag = result.manualReview ? "[manual review]" : result.refusalMatchesExpectation ? "ok" : "MISMATCH";
    console.log(flag);
  }

  await destroyContainer(container);

  const summary = summarize(results);

  console.log("\n=== Summary (auto-scored cases only; manual-review cases reported separately below) ===");
  console.log(`Refusal correctness: ${summary.refusalCorrectness.pass}/${summary.refusalCorrectness.total} (${(summary.refusalCorrectness.rate * 100).toFixed(1)}%)`);
  console.log(`Retrieval hit-rate:  ${summary.retrievalHitRate.pass}/${summary.retrievalHitRate.total} (${(summary.retrievalHitRate.rate * 100).toFixed(1)}%)`);
  console.log(
    `Groundedness: mean overlap ratio ${summary.groundedness.meanRatio?.toFixed(3) ?? "n/a"} across ${summary.groundedness.casesWithCitations} answered cases with citations (threshold ${summary.groundedness.threshold})`,
  );
  if (summary.falseRefusals.length) {
    console.log(`\nFalse refusals on auto-scored cases (expected an answer, got a refusal):`);
    for (const f of summary.falseRefusals) console.log(`  - ${f.id}: ${f.cause} (bestDenseSimilarity=${f.bestDenseSimilarity.toFixed(3)})`);
  }

  console.log("\n=== Manual-review cases (ambiguous / injection — see corpus/golden-set.json notes) ===");
  for (const r of results.filter((r) => r.manualReview)) {
    console.log(`  ${r.id} [${r.category}]: refused=${r.actualRefusal}, hit=${r.hit}, groundedRatio=${r.groundedRatio?.toFixed(3) ?? "n/a"}, forbiddenPhraseHit=${JSON.stringify(r.forbiddenPhraseHit)}`);
    console.log(`    answer: ${r.answerPreview}${r.answerPreview.length === 160 ? "..." : ""}`);
  }

  console.log("\n=== Full per-case results (JSON) ===");
  console.log(JSON.stringify({ summary, results }, null, 2));
}

main().catch((error) => {
  console.error("Eval run crashed:", error);
  process.exit(1);
});
