import puppeteer from "puppeteer";
import { renderReportHtml } from "./renderReportHtml.js";

// Renders the same HTML renderReportHtml.js produces for the DOCX twin's
// PDF counterpart — ADR-0004's "one report-content model, two renderers".
// No explicit executablePath: puppeteer.launch() already reads
// PUPPETEER_EXECUTABLE_PATH itself (set in the Docker image to the
// apt-installed chromium); locally it falls back to puppeteer's own
// cached Chrome for Testing binary.
export async function renderPdf(reportContent) {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(renderReportHtml(reportContent), { waitUntil: "networkidle0" });
    return await page.pdf({ format: "A4", printBackground: true, margin: { top: "1cm", bottom: "1cm", left: "1cm", right: "1cm" } });
  } finally {
    await browser.close();
  }
}
