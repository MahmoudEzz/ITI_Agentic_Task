import { DecisionRequestSchema, StartRunRequestSchema } from "../../../contracts/api.js";
import { NotFoundError } from "../../../domain/errors/index.js";

function sendEvent(reply, event, data) {
  reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// Ownership scoping is resolved once, here, at the run — see
// docs/SECURITY.md's "Access" section for why recruiter/hiring_manager are
// scoped differently on purpose: a recruiter may only read a run they
// created, a hiring manager may read any run (the approval gate and the
// bias-audit-trail view require it). A recruiter's own-run check that fails
// throws NotFoundError, not AuthorizationError — the route must not confirm
// that a run belonging to someone else even exists.
function assertCanView(run, user) {
  if (user.role === "hiring_manager") return;
  if (run.createdBy !== user.email) throw new NotFoundError("Run", run.id);
}

export async function registerRunRoutes(app, { runRepository, applyApprovalDecision, traceEventRepository, runScreeningWorkflow }) {
  // Same ownership scoping as GET /runs/:id, applied to a list — a
  // recruiter's own runs only, a hiring manager sees every run.
  app.get("/runs", { preHandler: app.requireAuth }, async (request, reply) => {
    const runs = await runRepository.findAll(request.user.role === "hiring_manager" ? {} : { createdBy: request.user.email });
    reply.send({ runs });
  });

  // SSE discrete progress events (FR-6/ADR-0007) as the screening pipeline
  // actually executes, ending with the final run/shortlist result — reads
  // from the exact same recordSpan onEvent hook that also persists
  // trace_events (Phase 7 PR1), not a second parallel mechanism.
  app.post("/runs", { preHandler: app.requireAuth }, async (request, reply) => {
    const body = StartRunRequestSchema.parse(request.body);

    reply.hijack();
    reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });

    try {
      const result = await runScreeningWorkflow({
        ...body,
        createdBy: request.user.email,
        onEvent: (event) => sendEvent(reply, "progress", event),
      });
      sendEvent(reply, "result", { runId: result.run.id, state: result.run.state, degraded: result.degraded, shortlist: result.shortlist, failures: result.failures });
    } catch (error) {
      sendEvent(reply, "error", { message: error.message });
    } finally {
      reply.raw.end();
    }
  });

  app.get("/runs/:id", { preHandler: app.requireAuth }, async (request, reply) => {
    const run = await runRepository.findById(request.params.id);
    if (!run) throw new NotFoundError("Run", request.params.id);
    assertCanView(run, request.user);
    reply.send(run);
  });

  // Same ownership scoping as GET /runs/:id (FR-9's trace view) — the
  // trace is part of the run, not a separately-permissioned resource.
  app.get("/runs/:id/trace", { preHandler: app.requireAuth }, async (request, reply) => {
    const run = await runRepository.findById(request.params.id);
    if (!run) throw new NotFoundError("Run", request.params.id);
    assertCanView(run, request.user);
    const events = await traceEventRepository.findByRunId(request.params.id);
    reply.send({ runId: request.params.id, events });
  });

  // No ownership check here beyond the role gate itself — any hiring
  // manager may decide on any run, by the same policy assertCanView
  // documents above.
  app.post("/runs/:id/decision", { preHandler: app.requireRole("hiring_manager") }, async (request, reply) => {
    const body = DecisionRequestSchema.parse(request.body);
    const result = await applyApprovalDecision({ runId: request.params.id, decidedBy: request.user.email, ...body });
    reply.send(result);
  });
}
