import { AskRequestSchema } from "../../../contracts/api.js";

// Writes one SSE frame. `event` names the client-side listener
// (EventSource's addEventListener(name, ...)); `data` is JSON-encoded so
// the client never has to guess a wire format per event type.
function sendEvent(reply, event, data) {
  reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// SSE prose streaming (FR-6, ADR-0007) — the only route in this codebase
// that hijacks the raw response instead of using reply.send(); Fastify's
// normal reply lifecycle assumes exactly one response body, which an SSE
// stream of many frames over one open connection isn't.
export async function registerAskRoutes(app, { answerQuestionStream }) {
  app.post("/ask", { preHandler: app.requireAuth }, async (request, reply) => {
    const body = AskRequestSchema.parse(request.body);

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    try {
      await answerQuestionStream({
        ...body,
        correlationId: crypto.randomUUID(),
        onEvent: (event) => {
          if (event.type === "delta") sendEvent(reply, "delta", { text: event.text });
          else if (event.type === "answer") sendEvent(reply, "answer", event.answer);
        },
      });
    } catch (error) {
      sendEvent(reply, "error", { message: error.message });
    } finally {
      reply.raw.end();
    }
  });
}
