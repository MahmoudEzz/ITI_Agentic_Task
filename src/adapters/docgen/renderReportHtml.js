function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function citationLabel(citationsByChunkId, chunkId) {
  const citation = citationsByChunkId.get(chunkId);
  // See renderDocx.js's citationLabel for why this is visibly marked rather
  // than a silent fallback to a bare id.
  if (!citation) return `[unresolved citation: ${chunkId}]`;
  return citation.page != null ? `${citation.documentTitle}, p.${citation.page}` : citation.documentTitle;
}

function scoringTableHtml(candidate, competencies, citationsByChunkId) {
  if (candidate.scores.length === 0) {
    return `<p class="degraded-note">No scores recorded — this candidate was included via degraded, LLM-free ranking.</p>`;
  }
  const scoreByCompetency = new Map(candidate.scores.map((s) => [s.competencyId, s]));
  const rows = competencies
    .map((competency) => {
      const score = scoreByCompetency.get(competency.id);
      const citations = score ? score.evidenceChunkIds.map((id) => citationLabel(citationsByChunkId, id)).join("; ") : "—";
      return `<tr>
        <td>${escapeHtml(competency.name)}</td>
        <td>${score ? `${score.value}/${competency.scaleMax}` : "—"}</td>
        <td>${score ? escapeHtml(score.rationale) : "Not scored (degraded run)"}</td>
        <td>${escapeHtml(citations)}</td>
      </tr>`;
    })
    .join("\n");
  return `<table><thead><tr><th>Competency</th><th>Score</th><th>Rationale</th><th>Citations</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function candidateSectionHtml(candidate, competencies, citationsByChunkId) {
  const compositeLabel = candidate.compositeScore !== null ? ` — composite ${candidate.compositeScore.toFixed(2)}` : "";
  const probes = candidate.interviewProbes.map((probe) => `<li>${escapeHtml(probe)}</li>`).join("\n");
  return `
    <section class="candidate">
      <h2>${candidate.rank}. ${escapeHtml(candidate.candidateHandle)}${compositeLabel}</h2>
      <p>${escapeHtml(candidate.summary)}</p>
      ${scoringTableHtml(candidate, competencies, citationsByChunkId)}
      <h3>Interview probes</h3>
      <ul>${probes}</ul>
    </section>`;
}

// The single HTML source both Puppeteer (PDF) and a human previewing the
// report render — plain CSS for table/citation formatting, no client JS.
export function renderReportHtml(reportContent) {
  const { run, roleId, degraded, candidates, competencies, citationsByChunkId } = reportContent;

  const degradedBanner = degraded
    ? `<p class="degraded-banner">This shortlist was produced via degraded, LLM-free ranking after a structured-completion step failed. Scores may be incomplete.</p>`
    : "";

  const sections = candidates.map((candidate) => candidateSectionHtml(candidate, competencies, citationsByChunkId)).join("\n");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 2rem; }
  h1 { font-size: 1.5rem; }
  h2 { font-size: 1.2rem; margin-top: 2rem; border-bottom: 1px solid #ccc; padding-bottom: 0.25rem; }
  h3 { font-size: 1rem; margin-top: 1rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
  th, td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: left; font-size: 0.85rem; vertical-align: top; }
  th { background: #f2f2f2; }
  .degraded-banner { font-weight: bold; background: #fff3cd; padding: 0.5rem; border: 1px solid #ffe69c; }
  .degraded-note { font-style: italic; }
  .meta { color: #555; font-size: 0.85rem; }
</style>
</head>
<body>
  <h1>Shortlist Report — ${escapeHtml(roleId)}</h1>
  <p class="meta">Run ${escapeHtml(run.id)} &middot; generated ${escapeHtml(new Date().toISOString())}</p>
  ${degradedBanner}
  ${sections}
</body>
</html>`;
}
