// {{var}} substitution only — no I/O, no external templating engine, the
// prompt file itself is the only place the actual wording lives (CLAUDE.md).
// Shared by every use case/agent that loads a prompt via loadPromptTemplate.js.
export function renderTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => vars[key] ?? "");
}
