// Plain vanilla JS, no framework/bundler — matches the plan's "minimal
// static HTML/JS UI" scope. The auth token lives only in memory (a module
// variable), never localStorage: a page refresh requires logging in again,
// a deliberate trade against XSS-exfiltrating a persisted token, acceptable
// for a demo UI whose job is to show streaming/approval/trace, not to be a
// production session manager.
let authToken = null;

function setActiveTab(name) {
  for (const button of document.querySelectorAll("nav button")) button.classList.toggle("active", button.dataset.tab === name);
  for (const section of document.querySelectorAll(".tab")) section.classList.toggle("active", section.id === `tab-${name}`);
}

for (const button of document.querySelectorAll("nav button")) {
  button.addEventListener("click", () => setActiveTab(button.dataset.tab));
}

function authHeaders(extra = {}) {
  return { ...extra, ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) };
}

// Browser EventSource only supports GET requests with no custom headers,
// which doesn't fit this API's POST+JWT-bearer routes — so SSE responses
// are consumed by hand via fetch()'s own ReadableStream, the same approach
// the project's own integration tests use (see
// tests/integration/httpStreaming.test.js's readSse()).
async function streamSse(url, body, onFrame) {
  const response = await fetch(url, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) });
  if (!response.ok && response.headers.get("content-type")?.includes("application/json")) {
    const errorBody = await response.json();
    throw new Error(errorBody.message ?? `request failed with ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const eventLine = raw.split("\n").find((l) => l.startsWith("event: "));
      const dataLine = raw.split("\n").find((l) => l.startsWith("data: "));
      if (eventLine && dataLine) onFrame(eventLine.slice("event: ".length), JSON.parse(dataLine.slice("data: ".length)));
    }
  }
}

// --- Login ---
document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  const statusEl = document.getElementById("login-status");
  statusEl.textContent = "Logging in...";
  try {
    const res = await fetch("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message ?? "login failed");
    authToken = body.token;
    document.getElementById("session-info").textContent = `${body.user.email} (${body.user.role})`;
    statusEl.textContent = "Logged in.";
  } catch (error) {
    statusEl.textContent = `Error: ${error.message}`;
  }
});

// --- Ask ---
document.getElementById("ask-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = document.getElementById("ask-question").value;
  const candidateHandle = document.getElementById("ask-candidate").value || undefined;
  const outputEl = document.getElementById("ask-output");
  const citationsEl = document.getElementById("ask-citations");
  outputEl.textContent = "";
  citationsEl.textContent = "";

  try {
    await streamSse("/ask", { question, candidateHandle }, (event_, data) => {
      if (event_ === "delta") outputEl.textContent += data.text;
      else if (event_ === "answer") {
        if (data.refused) {
          outputEl.textContent = `(refused: ${data.refusalReason})`;
        } else {
          citationsEl.textContent = "Citations: " + data.citations.map((c) => `${c.documentId}${c.page ? `, p.${c.page}` : ""}`).join("; ");
        }
      } else if (event_ === "error") {
        outputEl.textContent = `Error: ${data.message}`;
      }
    });
  } catch (error) {
    outputEl.textContent = `Error: ${error.message}`;
  }
});

// --- Run workflow ---
document.getElementById("run-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const roleId = document.getElementById("run-role").value;
  const rubricId = document.getElementById("run-rubric").value;
  const candidateHandles = document
    .getElementById("run-candidates")
    .value.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const progressEl = document.getElementById("run-progress");
  const resultEl = document.getElementById("run-result");
  progressEl.textContent = "";
  resultEl.textContent = "";

  try {
    await streamSse("/runs", { roleId, rubricId, candidateHandles }, (event_, data) => {
      if (event_ === "progress") progressEl.textContent += `${data.type}\n`;
      else if (event_ === "result") resultEl.textContent = `Run ${data.runId} -> ${data.state}${data.degraded ? " (degraded)" : ""}`;
      else if (event_ === "error") resultEl.textContent = `Error: ${data.message}`;
    });
  } catch (error) {
    resultEl.textContent = `Error: ${error.message}`;
  }
});

async function refreshRunsTable() {
  const res = await fetch("/runs", { headers: authHeaders() });
  const body = await res.json();
  const tbody = document.querySelector("#runs-table tbody");
  tbody.innerHTML = "";
  if (!res.ok) return;
  for (const run of body.runs) {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${run.id}</td><td>${run.state}</td><td>${run.createdBy}</td><td>${run.createdAt}</td>`;
    tbody.appendChild(row);
  }
}
document.getElementById("runs-refresh").addEventListener("click", refreshRunsTable);

// --- Approval decision ---
document.getElementById("decision-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const runId = document.getElementById("decision-run-id").value;
  const decision = document.getElementById("decision-value").value;
  const comment = document.getElementById("decision-comment").value || undefined;
  const statusEl = document.getElementById("decision-status");
  statusEl.textContent = "Submitting...";
  try {
    const res = await fetch(`/runs/${encodeURIComponent(runId)}/decision`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ decision, comment }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message ?? "decision failed");
    statusEl.textContent = JSON.stringify(body, null, 2);
  } catch (error) {
    statusEl.textContent = `Error: ${error.message}`;
  }
});

// --- Trace ---
document.getElementById("trace-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const runId = document.getElementById("trace-run-id").value;
  const tbody = document.querySelector("#trace-table tbody");
  tbody.innerHTML = "";
  try {
    const res = await fetch(`/runs/${encodeURIComponent(runId)}/trace`, { headers: authHeaders() });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message ?? "trace load failed");
    for (const e of body.events) {
      const durationMs = e.endedAt ? new Date(e.endedAt).getTime() - new Date(e.startedAt).getTime() : "";
      const row = document.createElement("tr");
      row.innerHTML = `<td>${e.span}</td><td>${e.startedAt}</td><td>${durationMs}</td><td>${e.tokensIn ?? "-"}/${e.tokensOut ?? "-"}</td><td>${e.costUsd ?? "-"}</td><td>${JSON.stringify(e.attributes)}</td>`;
      tbody.appendChild(row);
    }
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="6">Error: ${error.message}</td></tr>`;
  }
});
