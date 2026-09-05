// Hand-authored, not parsed from the corpus's rubric/competency-framework
// prose — those files are RAG content (markdown tables inside narrative
// text meant for a human reader and the retrieval pipeline), not a data
// source, and parsing them would be fragile for no real benefit at this
// scale. Every id/weight/anchor below is transcribed by hand from the named
// corpus document and MUST stay in sync with it if that document changes —
// there is no other link between the two; tests/unit/seedData.test.js
// asserts the transcription against the corpus text directly.
import { createCompetency } from "../../domain/entities/Competency.js";
import { createRubric } from "../../domain/entities/Rubric.js";

const SEEDED_BY = "corpus-seed";

// Source: corpus/competency-framework/competency-framework.txt. Anchor text
// below is a condensed paraphrase of each level's definition, not a verbatim
// copy — the corpus file remains the authoritative full text an evaluator
// or the Evidence Extractor would actually read.
export const COMPETENCIES = [
  {
    id: "TECH-PROF",
    name: "Technical Proficiency",
    description: "Depth and currency of hands-on technical skill, and demonstrated ability to build/operate/analyze production-grade systems rather than only academic work.",
    behavioralAnchors: {
      1: "Theoretical exposure only — no evidence of building anything substantial; trivial or absent code samples.",
      2: "Foundational, supervised work on narrowly scoped tasks; can explain own code but not broader design tradeoffs.",
      3: "Independently designed and shipped production features end-to-end; discusses real tradeoffs from own work.",
      4: "Made architecture-level decisions; root-caused subtle production incidents; explains cost of decisions clearly.",
      5: "Recognized technical authority sought out beyond their own team (tech talks, OSS maintainership, published writing).",
    },
    scaleMin: 1,
    scaleMax: 5,
  },
  {
    id: "PROB-SOLVE",
    name: "Problem Solving & Analytical Thinking",
    description: "Demonstrated approach to decomposing ambiguous problems, forming/testing hypotheses, and reaching well-reasoned conclusions from real examples.",
    behavioralAnchors: {
      1: "Needs a fully specified problem; defaults to guessing rather than structuring novel scenarios.",
      2: "Solves well-bounded problems methodically but hasn't framed an open-ended problem themselves.",
      3: "Frames and solves ambiguous problems independently, reaching evidence-backed conclusions.",
      4: "Balances rigor with pragmatism under real constraints; can articulate what would have changed their conclusion.",
      5: "Reframes problems others accepted as fixed, redirecting effort in a way that measurably improved the outcome.",
    },
    scaleMin: 1,
    scaleMax: 5,
  },
  {
    id: "COMMS",
    name: "Communication",
    description: "Clarity, structure, and audience-awareness of written/verbal communication, including explaining technical concepts to non-technical stakeholders.",
    behavioralAnchors: {
      1: "Requires significant translation by others; explanations are jargon-dense or too vague to act on.",
      2: "Communicates clearly to a like-minded technical audience; weak at adapting for non-technical stakeholders.",
      3: "Reliably adapts explanation to audience; written work is organized enough for an unfamiliar reader to follow.",
      4: "Communication actively drives alignment — credited with resolving a disagreement or securing buy-in.",
      5: "Sets the communication standard others adopt as their own default.",
    },
    scaleMin: 1,
    scaleMax: 5,
  },
  {
    id: "COLLAB",
    name: "Collaboration & Teamwork",
    description: "Demonstrated pattern of working effectively with others, including feedback, sharing credit, and adjusting approach to unblock a team outcome.",
    behavioralAnchors: {
      1: "Works in isolation; cannot describe a specific contribution to a collective outcome.",
      2: "Participates constructively within an assigned team structure but shows no initiative improving teamwork.",
      3: "Actively strengthens team function — improved a process or resolved a peer disagreement constructively.",
      4: "Elevates collaboration across team/org boundaries where incentives weren't naturally aligned.",
      5: "Shapes how the organization collaborates; a practice they introduced spread beyond their own team.",
    },
    scaleMin: 1,
    scaleMax: 5,
  },
  {
    id: "LEAD-INIT",
    name: "Leadership & Initiative",
    description: "Evidence of taking ownership beyond formally assigned scope, and influencing direction or quality of work for people not formally managed.",
    behavioralAnchors: {
      1: "Executes only what is explicitly assigned; no evidence of acting on an unassigned gap or risk.",
      2: "Takes initiative within their own individual scope only.",
      3: "Initiates work that benefits others without being asked — flagged a systemic risk, started a shared tool.",
      4: "Leads through influence, not authority, on efforts involving people who didn't report to them.",
      5: "Shapes strategic direction at a level normally reserved for formal leadership.",
    },
    scaleMin: 1,
    scaleMax: 5,
  },
  {
    id: "ADAPT-AGILE",
    name: "Adaptability & Learning Agility",
    description: "How quickly and effectively a candidate picks up unfamiliar technology, domains, or contexts, and how they respond when a plan turns out wrong.",
    behavioralAnchors: {
      1: "Struggles outside familiar territory; no evidence of successfully picking up something substantially new.",
      2: "Adapts with significant ramp-up time and close guidance.",
      3: "Adapts efficiently and independently within a reasonable timeframe, largely self-directed.",
      4: "Treats change as a source of advantage — used a forced pivot to reach a better outcome than the original plan.",
      5: "Builds organizational capacity to adapt — helped others adapt faster, reused beyond the candidate themselves.",
    },
    scaleMin: 1,
    scaleMax: 5,
  },
  {
    id: "OWNERSHIP",
    name: "Ownership & Accountability",
    description: "Whether a candidate follows through on commitments end-to-end, and how they respond when something under their responsibility goes wrong.",
    behavioralAnchors: {
      1: "Ownership stops at the assigned task boundary; no mention of what happened after 'built' or 'designed'.",
      2: "Follows through reliably on assigned scope, including unglamorous work, but not on ambiguous unassigned scope.",
      3: "Owns outcomes, not just tasks — took responsibility for an outcome even when parts depended on others.",
      4: "Owns failure as directly as success — root-caused, communicated, and prevented recurrence without deflecting.",
      5: "Accountability at organizational scale — owned an outcome whose failure would have org-wide consequences.",
    },
    scaleMin: 1,
    scaleMax: 5,
  },
  {
    id: "DETAIL-QUALITY",
    name: "Attention to Detail & Quality",
    description: "Consistency and rigor applied to catching errors, edge cases, and quality issues before they cause harm, evidenced by the candidate's own process.",
    behavioralAnchors: {
      1: "Quality is reactive — issues are caught by others (QA, review, users in production), not by the candidate.",
      2: "Follows an existing quality process reliably but hasn't improved it or caught something it would have missed.",
      3: "Actively hunts for edge cases — found a non-obvious bug or data issue through their own initiative.",
      4: "Builds quality into systems, not just their own output — introduced a mechanism that catches a class of error for everyone.",
      5: "Quality judgment shapes standards beyond their own work — a practice adopted as policy others are held to.",
    },
    scaleMin: 1,
    scaleMax: 5,
  },
];

// Sources: corpus/rubrics/rubric-{backend-engineer,data-analyst,frontend-engineer}.txt.
// Each rubric's weights are transcribed verbatim from its "COMPETENCY
// WEIGHTS" table and independently sum to 1.00 there, matching the invariant
// Rubric.js enforces on write.
export const RUBRICS = [
  {
    id: "rubric-backend-engineer",
    roleId: "backend-engineer",
    competencyWeights: [
      { competencyId: "TECH-PROF", weight: 0.25 },
      { competencyId: "PROB-SOLVE", weight: 0.2 },
      { competencyId: "OWNERSHIP", weight: 0.15 },
      { competencyId: "COLLAB", weight: 0.15 },
      { competencyId: "COMMS", weight: 0.1 },
      { competencyId: "ADAPT-AGILE", weight: 0.1 },
      { competencyId: "DETAIL-QUALITY", weight: 0.05 },
    ],
  },
  {
    id: "rubric-data-analyst",
    roleId: "data-analyst",
    competencyWeights: [
      { competencyId: "PROB-SOLVE", weight: 0.3 },
      { competencyId: "DETAIL-QUALITY", weight: 0.2 },
      { competencyId: "TECH-PROF", weight: 0.15 },
      { competencyId: "COMMS", weight: 0.15 },
      { competencyId: "OWNERSHIP", weight: 0.1 },
      { competencyId: "COLLAB", weight: 0.05 },
      { competencyId: "ADAPT-AGILE", weight: 0.05 },
    ],
  },
  {
    id: "rubric-frontend-engineer",
    roleId: "frontend-engineer",
    competencyWeights: [
      { competencyId: "TECH-PROF", weight: 0.25 },
      { competencyId: "DETAIL-QUALITY", weight: 0.2 },
      { competencyId: "COMMS", weight: 0.15 },
      { competencyId: "COLLAB", weight: 0.15 },
      { competencyId: "PROB-SOLVE", weight: 0.15 },
      { competencyId: "ADAPT-AGILE", weight: 0.05 },
      { competencyId: "LEAD-INIT", weight: 0.05 },
    ],
  },
];

// Validates every record through its domain factory before writing —
// Rubric.js's weight-sums-to-1 and Competency.js's anchor-count invariants
// run here exactly as they would anywhere else the entity is constructed.
export async function seedCompetenciesAndRubrics({ competencyRepository, rubricRepository }) {
  const results = { competencies: 0, rubrics: 0 };

  for (const data of COMPETENCIES) {
    const existing = await competencyRepository.findById(data.id);
    if (existing) continue;
    const competency = createCompetency(data);
    await competencyRepository.create(competency);
    results.competencies++;
  }

  for (const data of RUBRICS) {
    const existing = await rubricRepository.findByRoleId(data.roleId);
    if (existing) continue;
    const rubric = createRubric({ ...data, createdBy: SEEDED_BY });
    await rubricRepository.create(rubric);
    results.rubrics++;
  }

  return results;
}

async function main() {
  const { buildContainer, destroyContainer } = await import("../config/container.js");
  const container = buildContainer();
  const competencyRepository = container.resolve("competencyRepository");
  const rubricRepository = container.resolve("rubricRepository");

  const results = await seedCompetenciesAndRubrics({ competencyRepository, rubricRepository });
  console.log(`Seeded ${results.competencies} competencies, ${results.rubrics} rubrics (existing rows left untouched).`);

  await destroyContainer(container);
}

// Only run as a CLI entrypoint — importing this module for its exported data
// (as the unit test does) must never have the side effect of touching a DB.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Seed run crashed:", error);
    process.exit(1);
  });
}
