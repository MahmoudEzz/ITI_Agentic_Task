import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildContainer, destroyContainer } from "../src/infra/config/container.js";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// Same convention as ingestCorpus.js's CV_HANDLE_PATTERN — cv-NNN-name -> CAND-NNN.
const CV_HANDLE_PATTERN = /^cv-(\d+)/;

function usage() {
  console.error(
    [
      "Usage:",
      '  npm run screen -- run --role <roleId> --rubric <rubricId> [--by <createdBy>]',
      "      Screens every ingested candidate targeting <roleId> (per corpus/manifest.json) against <rubricId>.",
      "  npm run screen -- decide --run <runId> --decision approved|rejected|edited_and_approved --by <decidedBy> [--comment <text>]",
      "      Applies a human decision to a run currently AWAIT_APPROVAL.",
    ].join("\n"),
  );
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) flags[argv[i].slice(2)] = argv[++i];
  }
  return flags;
}

async function candidateHandlesForRole(roleId) {
  const manifest = JSON.parse(await readFile(path.join(repoRoot, "corpus", "manifest.json"), "utf-8"));
  return manifest.documents
    .filter((d) => d.type === "cv" && d.roleTarget === roleId)
    .map((d) => {
      const match = d.id.match(CV_HANDLE_PATTERN);
      return match ? `CAND-${match[1]}` : null;
    })
    .filter(Boolean);
}

async function runScreen(flags, container) {
  const { role, rubric, by = "cli-user" } = flags;
  if (!role || !rubric) return usage(), process.exit(1);

  const candidateHandles = await candidateHandlesForRole(role);
  if (candidateHandles.length === 0) {
    console.error(`No ingested candidates found for role "${role}" in corpus/manifest.json.`);
    process.exit(1);
  }

  console.log(`Screening ${candidateHandles.length} candidate(s) for "${role}" against "${rubric}": ${candidateHandles.join(", ")}`);
  const runScreeningWorkflow = container.resolve("runScreeningWorkflow");
  const result = await runScreeningWorkflow({ roleId: role, rubricId: rubric, candidateHandles, createdBy: by });

  console.log(`\nRun ${result.run.id} -> ${result.run.state}${result.degraded ? " (DEGRADED)" : ""}`);
  if (result.failures.length > 0) {
    console.log("Failures:");
    for (const f of result.failures) console.log(`  - ${f.candidateHandle}: ${f.reason}`);
  }
  console.log("\nShortlist:");
  for (const entry of result.shortlist.entries) {
    console.log(`  ${entry.rank}. ${entry.candidateHandle} — ${entry.summary}`);
    for (const probe of entry.interviewProbes) console.log(`       probe: ${probe}`);
  }
  console.log(`\nTo approve: npm run screen -- decide --run ${result.run.id} --decision approved --by "hiring-manager@example.com"`);
}

async function runDecide(flags, container) {
  const { run, decision, by, comment } = flags;
  if (!run || !decision || !by) return usage(), process.exit(1);

  const applyApprovalDecision = container.resolve("applyApprovalDecision");
  const result = await applyApprovalDecision({ runId: run, decision, decidedBy: by, comment });

  console.log(`Approval ${result.approval.id} (${result.approval.decision}) recorded for run ${run}.`);
  if (result.finalized) {
    console.log(`Shortlist ${result.finalized.shortlistId} finalized at ${result.finalized.finalizedAt}.`);
  } else {
    console.log("Run rejected — no shortlist finalized.");
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);

  const container = buildContainer();
  try {
    if (command === "run") await runScreen(flags, container);
    else if (command === "decide") await runDecide(flags, container);
    else {
      usage();
      process.exit(1);
    }
  } finally {
    await destroyContainer(container);
  }
}

main().catch((error) => {
  console.error("screen run crashed:", error);
  process.exit(1);
});
