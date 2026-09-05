import { createRun, transition } from "../../domain/entities/Run.js";
import { compositeScore } from "../../domain/entities/Score.js";
import { StructuredOutputError, InsufficientEvidenceError, NotFoundError, DomainError } from "../../domain/errors/index.js";
import { recordSpan } from "../tracing/recordSpan.js";

// A single "plain-RAG" fallback shortlist — no LLM call at all, just a
// deterministic ranking by composite score. This is what FR-5's
// DEGRADED_DRAFT actually means: bypassing the failure-prone structured-
// output mechanism entirely rather than retrying it a second time at the
// drafting stage on top of an already-degraded run.
function buildDegradedShortlist(candidateResults) {
  return [...candidateResults]
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .map((c, i) => ({
      candidateHandle: c.candidateHandle,
      rank: i + 1,
      summary: `Composite score ${c.compositeScore.toFixed(2)} — degraded draft (automatic ranking only; the Shortlist Drafter agent did not run for this candidate pool, review raw competency scores directly).`,
      interviewProbes: [
        "This shortlist was produced by automatic fallback, not the Shortlist Drafter agent — verify evidence quality manually before proceeding.",
        "Review each competency's rationale and cited evidence directly rather than relying on this summary.",
      ],
    }));
}

// The full FSM (ADR-0002): INGEST_CONTEXT -> EXTRACT_EVIDENCE ->
// REDACT_PROTECTED_ATTRS -> SCORE_RUBRIC -> DRAFT_SHORTLIST ->
// AWAIT_APPROVAL, with DEGRADED_DRAFT as the graceful-degradation branch
// (FR-5). Every transition is validated by Run.js's own transition table
// before being persisted — this orchestrator can never write an illegal
// state to run_steps, the same guarantee the domain entity already gives
// any other caller.
//
// Granularity note: extractRedactScore.js composes extract+redact+score
// as one call per candidate. The RUN's states represent pipeline PHASES
// for the whole candidate pool, not a per-candidate loop, so this
// orchestrator transitions EXTRACT_EVIDENCE once for the batch, processes
// every candidate through it, and only advances to REDACT_PROTECTED_ATTRS
// / SCORE_RUBRIC once the whole batch is known to have succeeded — since
// REDACT_PROTECTED_ATTRS has no legal DEGRADED_DRAFT transition in Run.js's
// table, any candidate failure (redaction wiping all evidence, or a
// structured-completion step exhausting retries) is treated as the batch
// degrading out of EXTRACT_EVIDENCE, which does allow it.
export function createRunScreeningWorkflowUseCase({
  runRepository,
  scoreRepository,
  shortlistRepository,
  biasAuditLogRepository,
  extractRedactScore,
  shortlistDrafter,
  rubricRepository,
  traceEventRepository,
}) {
  return async function runScreeningWorkflow({ roleId, rubricId, candidateHandles, createdBy, correlationId }) {
    if (candidateHandles.length === 0) {
      throw new DomainError("runScreeningWorkflow requires at least one candidateHandle", "VALIDATION_ERROR");
    }

    const rubric = await rubricRepository.findById(rubricId);
    if (!rubric) throw new NotFoundError("Rubric", rubricId);

    // One request = one run = one correlation scope, for this
    // single-process app (FR-9) — a caller-supplied correlationId (HTTP
    // request ingress) becomes the run's own id rather than a separate
    // value tracked alongside it; the CLI (no request) falls back to
    // generating its own, exactly as before this existed.
    let run = createRun({ id: correlationId ?? crypto.randomUUID(), workflowType: "screening", createdBy });
    await runRepository.create(run);
    const traceContext = { correlationId: run.id, runId: run.id };

    run = transition(run, "EXTRACT_EVIDENCE");
    await runRepository.transitionTo(run.id, run.state);

    const candidateResults = [];
    const failures = [];
    for (const candidateHandle of candidateHandles) {
      try {
        const { scores, auditEntries } = await recordSpan(
          traceEventRepository,
          { ...traceContext, span: "candidate.extract_redact_score", attributes: { candidateHandle } },
          () => extractRedactScore({ candidateHandle, rubricId }, traceContext),
        );
        await biasAuditLogRepository.createMany(run.id, auditEntries);
        candidateResults.push({ candidateHandle, scores, compositeScore: compositeScore(scores, rubric) });
      } catch (error) {
        if (error instanceof StructuredOutputError || error instanceof InsufficientEvidenceError) {
          failures.push({ candidateHandle, reason: error.message });
        } else {
          throw error;
        }
      }
    }

    if (candidateResults.length === 0) {
      run = transition(run, "FAILED");
      await runRepository.transitionTo(run.id, run.state, { note: `Every candidate failed extraction/scoring: ${failures.map((f) => f.candidateHandle).join(", ")}` });
      throw new DomainError(`Screening run failed — no candidate could be scored (${failures.length} failure(s))`, "SCREENING_FAILED");
    }

    for (const { candidateHandle, scores } of candidateResults) {
      await scoreRepository.createMany(run.id, candidateHandle, scores);
    }

    if (failures.length > 0) {
      run = transition(run, "DEGRADED_DRAFT");
      await runRepository.transitionTo(run.id, run.state, {
        note: `Degraded: ${failures.length} candidate(s) could not be scored (${failures.map((f) => f.candidateHandle).join(", ")})`,
      });

      const shortlistEntries = buildDegradedShortlist(candidateResults);
      const shortlist = await shortlistRepository.create({ id: crypto.randomUUID(), runId: run.id, roleId, entries: shortlistEntries, degraded: true });

      run = transition(run, "AWAIT_APPROVAL");
      await runRepository.transitionTo(run.id, run.state);
      return { run, shortlist, degraded: true, failures };
    }

    run = transition(run, "REDACT_PROTECTED_ATTRS");
    await runRepository.transitionTo(run.id, run.state);
    run = transition(run, "SCORE_RUBRIC");
    await runRepository.transitionTo(run.id, run.state);
    run = transition(run, "DRAFT_SHORTLIST");
    await runRepository.transitionTo(run.id, run.state);

    try {
      const { shortlist: shortlistEntries } = await shortlistDrafter(
        {
          roleId,
          candidates: candidateResults.map((c) => ({ candidateHandle: c.candidateHandle, compositeScore: c.compositeScore, scores: c.scores })),
        },
        traceContext,
      );

      const shortlist = await shortlistRepository.create({ id: crypto.randomUUID(), runId: run.id, roleId, entries: shortlistEntries, degraded: false });

      run = transition(run, "AWAIT_APPROVAL");
      await runRepository.transitionTo(run.id, run.state);
      return { run, shortlist, degraded: false, failures: [] };
    } catch (error) {
      if (!(error instanceof StructuredOutputError)) throw error;

      run = transition(run, "DEGRADED_DRAFT");
      await runRepository.transitionTo(run.id, run.state, { note: `Shortlist Drafter failed: ${error.message}` });

      const shortlistEntries = buildDegradedShortlist(candidateResults);
      const shortlist = await shortlistRepository.create({ id: crypto.randomUUID(), runId: run.id, roleId, entries: shortlistEntries, degraded: true });

      run = transition(run, "AWAIT_APPROVAL");
      await runRepository.transitionTo(run.id, run.state);
      return { run, shortlist, degraded: true, failures: [] };
    }
  };
}
