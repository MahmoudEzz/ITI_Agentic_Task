import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } from "docx";

function citationLabel(citationsByChunkId, chunkId) {
  const citation = citationsByChunkId.get(chunkId);
  // Falls back to the raw chunk id, visibly marked, rather than silently
  // showing what looks like a normal citation — a bare UUID next to a score
  // reads as a rendering bug to a reader unless it's explicit that
  // resolution actually failed.
  if (!citation) return `[unresolved citation: ${chunkId}]`;
  return citation.page != null ? `${citation.documentTitle}, p.${citation.page}` : citation.documentTitle;
}

function scoringTable(candidate, competencies, citationsByChunkId) {
  const scoreByCompetency = new Map(candidate.scores.map((s) => [s.competencyId, s]));

  const headerRow = new TableRow({
    children: ["Competency", "Score", "Rationale", "Citations"].map(
      (text) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })] }),
    ),
  });

  const rows = competencies.map((competency) => {
    const score = scoreByCompetency.get(competency.id);
    const citations = score ? score.evidenceChunkIds.map((id) => citationLabel(citationsByChunkId, id)).join("; ") : "—";
    return new TableRow({
      children: [
        new Paragraph(competency.name),
        new Paragraph(score ? `${score.value}/${competency.scaleMax}` : "—"),
        new Paragraph(score ? score.rationale : "Not scored (degraded run)"),
        new Paragraph(citations),
      ].map((paragraph) => new TableCell({ children: [paragraph] })),
    });
  });

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...rows] });
}

function candidateSection(candidate, competencies, citationsByChunkId) {
  const children = [
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      text: `${candidate.rank}. ${candidate.candidateHandle}${candidate.compositeScore !== null ? ` — composite ${candidate.compositeScore.toFixed(2)}` : ""}`,
    }),
    new Paragraph(candidate.summary),
  ];

  if (candidate.scores.length > 0) {
    children.push(scoringTable(candidate, competencies, citationsByChunkId));
  } else {
    children.push(new Paragraph({ children: [new TextRun({ text: "No scores recorded — this candidate was included via degraded, LLM-free ranking.", italics: true })] }));
  }

  children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, text: "Interview probes" }));
  for (const probe of candidate.interviewProbes) {
    children.push(new Paragraph({ text: probe, bullet: { level: 0 } }));
  }

  return children;
}

export async function renderDocx(reportContent) {
  const { run, roleId, degraded, candidates, competencies, citationsByChunkId } = reportContent;

  const children = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, text: `Shortlist Report — ${roleId}` }),
    new Paragraph(`Run ${run.id} · generated ${new Date().toISOString()}`),
  ];

  if (degraded) {
    children.push(
      new Paragraph({ children: [new TextRun({ text: "This shortlist was produced via degraded, LLM-free ranking after a structured-completion step failed. Scores may be incomplete.", bold: true })] }),
    );
  }

  for (const candidate of candidates) {
    children.push(...candidateSection(candidate, competencies, citationsByChunkId));
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}
