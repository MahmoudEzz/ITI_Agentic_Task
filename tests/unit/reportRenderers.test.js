import { test } from "node:test";
import assert from "node:assert/strict";
import mammoth from "mammoth";

import { renderReportHtml } from "../../src/adapters/docgen/renderReportHtml.js";
import { renderDocx } from "../../src/adapters/docgen/renderDocx.js";

const COMPETENCY = { id: "TECH-PROF", name: "Technical Proficiency", scaleMax: 5 };

function reportContent({ degraded = false, citationsByChunkId = new Map() } = {}) {
  return {
    run: { id: "run-1", workflowType: "screening", createdBy: "recruiter@example.com" },
    roleId: "backend-engineer",
    degraded,
    finalizedAt: new Date().toISOString(),
    competencies: [COMPETENCY],
    candidates: [
      {
        candidateHandle: "CAND-001",
        rank: 1,
        summary: "Strong candidate.",
        interviewProbes: ["Tell me about a time...", "How would you..."],
        scores: [{ candidateHandle: "CAND-001", competencyId: "TECH-PROF", value: 5, rationale: "Great code.", evidenceChunkIds: ["chunk-1"] }],
        compositeScore: 5,
      },
    ],
    citationsByChunkId,
  };
}

test("renderReportHtml resolves a citation to document title and page", () => {
  const citationsByChunkId = new Map([["chunk-1", { chunkId: "chunk-1", documentId: "doc-1", documentTitle: "CAND-001 CV", page: 2 }]]);
  const html = renderReportHtml(reportContent({ citationsByChunkId }));
  assert.match(html, /CAND-001 CV, p\.2/);
});

test("renderReportHtml visibly marks an unresolved citation rather than showing a bare chunk id silently", () => {
  const html = renderReportHtml(reportContent({ citationsByChunkId: new Map() }));
  assert.match(html, /\[unresolved citation: chunk-1\]/);
});

test("renderReportHtml includes the degraded banner only when the shortlist is degraded", () => {
  const degradedHtml = renderReportHtml(reportContent({ degraded: true }));
  assert.match(degradedHtml, /degraded, LLM-free ranking/);

  const normalHtml = renderReportHtml(reportContent({ degraded: false }));
  assert.doesNotMatch(normalHtml, /degraded, LLM-free ranking/);
});

test("renderReportHtml escapes candidate-controlled text to prevent HTML injection", () => {
  const content = reportContent();
  content.candidates[0].summary = '<script>alert("x")</script>';
  const html = renderReportHtml(content);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("renderDocx produces a non-empty real docx buffer for a normal candidate", async () => {
  const citationsByChunkId = new Map([["chunk-1", { chunkId: "chunk-1", documentId: "doc-1", documentTitle: "CAND-001 CV", page: 1 }]]);
  const buffer = await renderDocx(reportContent({ citationsByChunkId }));
  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 0);
  // A real .docx is a zip archive — starts with the PK magic bytes.
  assert.equal(buffer.slice(0, 2).toString("ascii"), "PK");
});

test("renderReportHtml shows the actual quoted evidence text next to its resolved citation, closing the citation-shows-location-not-text gap", () => {
  const content = reportContent();
  content.candidates[0].scores[0].evidenceSnippets = [{ sourceChunkId: "chunk-1", text: "Led a payments migration end to end." }];
  const citationsByChunkId = new Map([["chunk-1", { chunkId: "chunk-1", documentId: "doc-1", documentTitle: "CAND-001 CV", page: 2 }]]);
  const html = renderReportHtml({ ...content, citationsByChunkId });
  assert.match(html, /CAND-001 CV, p\.2: &quot;Led a payments migration end to end\.&quot;/);
});

test("renderReportHtml falls back to citation-only display for a score with no evidenceSnippets (pre-migration data)", () => {
  const html = renderReportHtml(reportContent({ citationsByChunkId: new Map([["chunk-1", { chunkId: "chunk-1", documentId: "doc-1", documentTitle: "CAND-001 CV", page: 2 }]]) }));
  assert.match(html, /CAND-001 CV, p\.2/);
  assert.doesNotMatch(html, /: &quot;/);
});

test("renderDocx embeds the actual quoted evidence text, verified by re-extracting the real docx buffer's text", async () => {
  const content = reportContent();
  content.candidates[0].scores[0].evidenceSnippets = [{ sourceChunkId: "chunk-1", text: "Led a payments migration end to end." }];
  const citationsByChunkId = new Map([["chunk-1", { chunkId: "chunk-1", documentId: "doc-1", documentTitle: "CAND-001 CV", page: 2 }]]);
  const buffer = await renderDocx({ ...content, citationsByChunkId });

  const { value: text } = await mammoth.extractRawText({ buffer });
  assert.match(text, /Led a payments migration end to end\./);
  assert.match(text, /CAND-001 CV, p\.2/);
});

test("renderDocx handles a degraded candidate with zero scores without throwing", async () => {
  const content = reportContent();
  content.candidates[0].scores = [];
  content.candidates[0].compositeScore = null;
  const buffer = await renderDocx(content);
  assert.ok(buffer.length > 0);
});
