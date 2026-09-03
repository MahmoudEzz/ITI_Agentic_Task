// One-off script that builds corpus/manifest.json from the actual files on
// disk (word counts for txt, known word counts for docx from an earlier
// mammoth check, actual page count for PDFs) plus the fixture metadata
// authored alongside each document. Run once; the output is committed.
import fs from "node:fs/promises";
import path from "node:path";

function wordsFromText(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
function pagesFromWords(words) {
  return Math.max(1, Math.ceil(words / 500));
}

const root = process.cwd();

async function txtEntry(relPath, meta) {
  const text = await fs.readFile(path.join(root, relPath), "utf8");
  const words = wordsFromText(text);
  return {
    path: relPath,
    format: "txt",
    pages: pagesFromWords(words),
    pageCountMethod: "estimated_500_words_per_page",
    words,
    ...meta,
  };
}

// docx word counts confirmed via `mammoth.extractRawText` during authoring
// (see docs/AI-USAGE-LOG.md / this PR's description) — mammoth itself is not
// a corpus-generation dependency, so it isn't re-run here.
const docxWordCounts = {
  "corpus/cvs/cv-003-omar-farouk.docx": 139,
  "corpus/cvs/cv-009-rana-zaki.docx": 155,
  "corpus/cvs/cv-012-dina-kamal.docx": 183,
  "corpus/cvs/cv-020-aya-mostafa.docx": 163,
  "corpus/cvs/cv-024-mina-abdel-malak-a.docx": 124,
};

function docxEntry(relPath, meta) {
  const words = docxWordCounts[relPath];
  return {
    path: relPath,
    format: "docx",
    pages: pagesFromWords(words),
    pageCountMethod: "estimated_500_words_per_page",
    words,
    ...meta,
  };
}

// Native-text PDFs: real, drawn text; page count is the actual PDF page
// count (verified via pdf-parse during authoring — both are 1-page PDFs).
function nativePdfEntry(relPath, meta) {
  return { path: relPath, format: "pdf", pages: 1, pageCountMethod: "actual", ...meta };
}

// Scanned (image-only) PDFs: actual PDF page count, confirmed via pdf-parse
// during authoring that each has ~0 extractable characters (the OCR fixture).
function scannedPdfEntry(relPath, meta) {
  return { path: relPath, format: "pdf", pages: 1, pageCountMethod: "actual", ocrRequired: true, ...meta };
}

const manifest = [];

manifest.push(
  await txtEntry("corpus/job-descriptions/jd-backend-engineer.txt", { id: "jd-backend-engineer", type: "job_description", roleTarget: "backend-engineer" }),
  await txtEntry("corpus/job-descriptions/jd-data-analyst.txt", { id: "jd-data-analyst", type: "job_description", roleTarget: "data-analyst" }),
  await txtEntry("corpus/job-descriptions/jd-frontend-engineer.txt", { id: "jd-frontend-engineer", type: "job_description", roleTarget: "frontend-engineer" }),
  await txtEntry("corpus/competency-framework/competency-framework.txt", { id: "competency-framework", type: "competency_framework" }),
  await txtEntry("corpus/rubrics/rubric-backend-engineer.txt", { id: "rubric-backend-engineer", type: "rubric", roleTarget: "backend-engineer" }),
  await txtEntry("corpus/rubrics/rubric-data-analyst.txt", { id: "rubric-data-analyst", type: "rubric", roleTarget: "data-analyst" }),
  await txtEntry("corpus/rubrics/rubric-frontend-engineer.txt", { id: "rubric-frontend-engineer", type: "rubric", roleTarget: "frontend-engineer" }),
  await txtEntry("corpus/policies/policy-interview-process-playbook.txt", {
    id: "policy-interview-process-playbook",
    type: "policy",
    fixtures: ["prompt_injection"],
  }),
  await txtEntry("corpus/policies/policy-diversity-anti-bias-hiring.txt", { id: "policy-diversity-anti-bias-hiring", type: "policy" }),
  await txtEntry("corpus/policies/policy-compensation-bands-leveling.txt", { id: "policy-compensation-bands-leveling", type: "policy" }),
  await txtEntry("corpus/policies/policy-candidate-data-handling-privacy.txt", { id: "policy-candidate-data-handling-privacy", type: "policy" }),
  await txtEntry("corpus/policies/policy-remote-compensation-addendum.txt", { id: "policy-remote-compensation-addendum", type: "policy" }),
  await txtEntry("corpus/policies/policy-interview-question-bank.txt", { id: "policy-interview-question-bank", type: "process_guide" }),
  await txtEntry("corpus/policies/interview-guide-backend-engineer.txt", { id: "interview-guide-backend-engineer", type: "process_guide", roleTarget: "backend-engineer" }),
  await txtEntry("corpus/policies/interview-guide-data-analyst.txt", { id: "interview-guide-data-analyst", type: "process_guide", roleTarget: "data-analyst" }),
  await txtEntry("corpus/policies/interview-guide-frontend-engineer.txt", { id: "interview-guide-frontend-engineer", type: "process_guide", roleTarget: "frontend-engineer" }),
  await txtEntry("corpus/onboarding/onboarding-offer-process.txt", { id: "onboarding-offer-process", type: "process_guide" }),
);

const cvMeta = [
  ["cv-001-ahmed-youssef.txt", "backend-engineer", "Ahmed Youssef", []],
  ["cv-002-sara-mansour.pdf", "backend-engineer", "Sara Mansour", []],
  ["cv-003-omar-farouk.docx", "backend-engineer", "Omar Farouk", ["prompt_injection"]],
  ["cv-004-karim-elsayed.txt", "backend-engineer", "Karim ElSayed", []],
  ["cv-005-yasmine-adel.pdf", "backend-engineer", "Yasmine Adel", []],
  ["cv-006-hassan-ibrahim.txt", "backend-engineer", "Hassan Ibrahim", ["bias"]],
  ["cv-007-nourhan-tarek.pdf", "backend-engineer", "Nourhan Tarek", []],
  ["cv-008-mostafa-hany.txt", "backend-engineer", "Mostafa Hany", []],
  ["cv-009-rana-zaki.docx", "backend-engineer", "Rana Zaki", []],
  ["cv-010-laila-fahmy.txt", "data-analyst", "Laila Fahmy", []],
  ["cv-011-tamer-nabil.txt", "data-analyst", "Tamer Nabil", []],
  ["cv-012-dina-kamal.docx", "data-analyst", "Dina Kamal", ["bias"]],
  ["cv-013-amr-shawky.txt", "data-analyst", "Amr Shawky", []],
  ["cv-014-heba-roshdy.pdf", "data-analyst", "Heba Roshdy", []],
  ["cv-015-youssef-adly.txt", "data-analyst", "Youssef Adly", ["prompt_injection"]],
  ["cv-016-mariam-sabry.txt", "data-analyst", "Mariam Sabry", []],
  ["cv-017-khaled-fathy.pdf", "data-analyst", "Khaled Fathy", []],
  ["cv-018-nadia-ezzat.txt", "frontend-engineer", "Nadia Ezzat", []],
  ["cv-019-sherif-wahba.txt", "frontend-engineer", "Sherif Wahba", []],
  ["cv-020-aya-mostafa.docx", "frontend-engineer", "Aya Mostafa", ["bias"]],
  ["cv-021-bassem-naguib.txt", "frontend-engineer", "Bassem Naguib", ["prompt_injection"]],
  ["cv-022-salma-gaber.pdf", "frontend-engineer", "Salma Gaber", []],
  ["cv-023-fady-rizk.txt", "frontend-engineer", "Fady Rizk", []],
  ["cv-024-mina-abdel-malak-a.docx", "frontend-engineer", "Mina Abdel Malak", ["conflicting_pair"]],
  ["cv-025-mina-abdel-malak-b.pdf", "frontend-engineer", "Mina Abdel Malak", ["conflicting_pair"]],
];

for (const [file, roleTarget, candidateName, fixtures] of cvMeta) {
  const relPath = `corpus/cvs/${file}`;
  const id = `cv-${file.split("-")[1]}-${path.parse(file).name.split("-").slice(2).join("-")}`;
  const meta = { id, type: "cv", roleTarget, candidateName, fixtures };
  if (fixtures.includes("conflicting_pair")) meta.conflictGroup = "mina-abdel-malak";

  if (file.endsWith(".txt")) manifest.push(await txtEntry(relPath, meta));
  else if (file.endsWith(".docx")) manifest.push(docxEntry(relPath, meta));
  else if (cvMeta.find(([f]) => f === file) && fixtures.length === 0 && [
      "cv-002-sara-mansour.pdf","cv-007-nourhan-tarek.pdf","cv-014-heba-roshdy.pdf","cv-022-salma-gaber.pdf",
    ].includes(file)) {
    manifest.push(scannedPdfEntry(relPath, meta));
  } else if (["cv-005-yasmine-adel.pdf", "cv-017-khaled-fathy.pdf"].includes(file)) {
    manifest.push(nativePdfEntry(relPath, meta));
  } else if (file === "cv-025-mina-abdel-malak-b.pdf") {
    manifest.push(scannedPdfEntry(relPath, meta));
  }
}

const totalPages = manifest.reduce((sum, d) => sum + d.pages, 0);
const summary = {
  documentCount: manifest.length,
  totalPages,
  byType: Object.fromEntries(
    Object.entries(
      manifest.reduce((acc, d) => {
        acc[d.type] = (acc[d.type] ?? 0) + 1;
        return acc;
      }, {}),
    ),
  ),
  byFormat: Object.fromEntries(
    Object.entries(
      manifest.reduce((acc, d) => {
        acc[d.format] = (acc[d.format] ?? 0) + 1;
        return acc;
      }, {}),
    ),
  ),
};

await fs.writeFile(
  path.join(root, "corpus/manifest.json"),
  JSON.stringify({ summary, documents: manifest }, null, 2) + "\n",
);
console.log(JSON.stringify(summary, null, 2));
