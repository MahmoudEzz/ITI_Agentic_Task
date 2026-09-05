import { ToolNotAllowedError } from "../../domain/errors/index.js";
import { getToolDefinition } from "../../contracts/tools.js";
import { recordSpan } from "../tracing/recordSpan.js";

// The orchestrator (not the LLM) decides which tool runs at each pipeline
// step — ADR-0002 already rejected dynamic planner/ReAct-style tool
// selection, and a tool-calling loop on a local 3B model is the single
// most likely thing to make this submission look flaky. What still needs
// to be real, not just implicit in "the code just doesn't call it," is the
// *restriction*: create one of these scoped to each agent's declared
// allow-list, and a tool call outside that list is rejected even if
// something (a bug, a future change) tries to route it through anyway.
export function createScopedToolDispatcher({ agentName, allowedTools, implementations, traceEventRepository }) {
  return async function callTool(toolName, input, traceContext = {}) {
    if (!allowedTools.includes(toolName)) {
      throw new ToolNotAllowedError(toolName, agentName, allowedTools);
    }
    // Confirms the tool is real and registered (throws NotFoundError from
    // getToolDefinition otherwise) — allow-listing a nonexistent tool name
    // is a config bug, not a permissions question.
    getToolDefinition(toolName);
    const implementation = implementations[toolName];
    if (!implementation) {
      throw new Error(`Tool "${toolName}" is allow-listed for "${agentName}" but has no wired implementation`);
    }

    // FR-9: every tool call gets a trace_events row, same as every LLM
    // call — recordSpan itself is fail-open when no traceEventRepository
    // is wired (most unit tests construct a dispatcher without one), so
    // this call site doesn't need its own guard.
    return recordSpan(traceEventRepository, { ...traceContext, span: `tool.${toolName}` }, () => implementation(input));
  };
}
