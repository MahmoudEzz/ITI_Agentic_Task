// One-off corpus generation script. Renders an HTML CV to a PNG screenshot
// via Puppeteer, then embeds that PNG as the entire content of a PDF page
// via pdf-lib — the result has NO text layer at all, forcing the OCR path
// (ADR-0004 / T6). This is deliberately different from
// generate-native-pdf-cvs.mjs, which draws real selectable text.
import puppeteer from "puppeteer";
import { PDFDocument } from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";

function htmlCv({ name, title, contact, summary, experience, education, skills }) {
  const expHtml = experience
    .map(
      (job) =>
        `<p style="margin:4px 0 2px 0;"><b>${job.role}</b></p><ul style="margin:0 0 10px 0;">${job.bullets
          .map((b) => `<li>${b}</li>`)
          .join("")}</ul>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font-family: Helvetica, Arial, sans-serif; color: #111; width: 700px; padding: 30px; }
    h1 { font-size: 22px; margin-bottom: 2px; }
    .title { font-size: 14px; color: #333; margin-bottom: 2px; }
    .contact { font-size: 11px; color: #555; margin-bottom: 16px; }
    h2 { font-size: 14px; border-bottom: 1px solid #999; padding-bottom: 2px; margin-top: 18px; }
    p, li { font-size: 11.5px; line-height: 1.4; }
  </style></head><body>
    <h1>${name}</h1>
    <div class="title">${title}</div>
    <div class="contact">${contact}</div>
    <h2>Summary</h2><p>${summary}</p>
    <h2>Experience</h2>${expHtml}
    <h2>Education</h2><p>${education}</p>
    <h2>Skills</h2><p>${skills}</p>
  </body></html>`;
}

const cvs = [
  {
    file: "cv-002-sara-mansour.pdf",
    name: "Sara Mansour",
    title: "Backend Engineer",
    contact: "sara.mansour.dev@example-mail.com | Cairo, Egypt",
    summary:
      "Backend engineer with 4 years of experience building internal platform tooling and APIs, currently focused on developer-experience improvements for other engineering teams.",
    experience: [
      {
        role: "Backend Engineer, Falcon Internal Tools (2021 - Present)",
        bullets: [
          "Built the internal deployment API used by all engineering teams, replacing a manual, ticket-based deployment process.",
          "Reduced average deployment time from 25 minutes to 4 minutes by parallelizing previously sequential build steps after profiling the pipeline.",
          "Introduced structured logging across the internal tools platform after repeated difficulty debugging cross-service issues from unstructured logs.",
        ],
      },
      {
        role: "Junior Backend Engineer, Falcon Internal Tools (2020 - 2021)",
        bullets: [
          "Maintained a set of internal Slack-integrated bots used for on-call notifications.",
          "Fixed bugs in the internal tools API as reported by engineering teams.",
        ],
      },
    ],
    education: "B.Sc. in Computer Science, Cairo University",
    skills: "Node.js, Python, PostgreSQL, Docker, CI/CD pipeline design",
  },
  {
    file: "cv-007-nourhan-tarek.pdf",
    name: "Nourhan Tarek",
    title: "Backend Engineer",
    contact: "nourhan.tarek.eng@example-mail.com | Giza, Egypt",
    summary:
      "Backend engineer with 3 years of experience in Node.js and PostgreSQL, working primarily on a subscription billing product.",
    experience: [
      {
        role: "Backend Engineer, Palm Subscription Systems (2022 - Present)",
        bullets: [
          "Own the recurring-billing service, including handling failed-payment retry logic and dunning email triggers.",
          "Fixed a bug causing duplicate charges for a small number of customers during a plan-upgrade flow, and built a safeguard test to prevent recurrence.",
          "Wrote a design doc proposing a move to a more robust state machine for subscription lifecycle handling, currently under team review.",
        ],
      },
      {
        role: "Junior Backend Engineer, Palm Subscription Systems (2021 - 2022)",
        bullets: [
          "Implemented well-specified billing-related tickets under senior guidance.",
          "Wrote integration tests for the payment-webhook handler.",
        ],
      },
    ],
    education: "B.Sc. in Computer Science, Cairo University",
    skills: "Node.js, PostgreSQL, Stripe API, Docker",
  },
  {
    file: "cv-014-heba-roshdy.pdf",
    name: "Heba Roshdy",
    title: "Data Analyst",
    contact: "heba.roshdy.analytics@example-mail.com | Cairo, Egypt",
    summary:
      "Data analyst with 3 years of experience in marketing analytics, focused on campaign performance measurement and attribution.",
    experience: [
      {
        role: "Data Analyst, Orbit Marketing Group (2022 - Present)",
        bullets: [
          "Built a multi-touch attribution model to replace the team's previous last-click model, which had been systematically undervaluing upper-funnel channels.",
          "Flagged a tracking discrepancy between two ad platforms' reported spend and our internal records, which led to recovering a billing error from one vendor.",
          "Maintain the weekly campaign-performance dashboard used by the marketing leadership team.",
        ],
      },
      {
        role: "Junior Data Analyst, Orbit Marketing Group (2021 - 2022)",
        bullets: [
          "Pulled campaign performance data for weekly reporting.",
          "Learned SQL and dashboarding tools on the job.",
        ],
      },
    ],
    education: "B.Sc. in Business Administration, Cairo University",
    skills: "SQL, Looker, Excel, attribution modeling basics",
  },
  {
    file: "cv-022-salma-gaber.pdf",
    name: "Salma Gaber",
    title: "Frontend Engineer",
    contact: "salma.gaber.fe@example-mail.com | Cairo, Egypt",
    summary:
      "Frontend engineer with 6 years of experience, the last three as a de-facto frontend architecture lead for a consumer product used by hundreds of thousands of daily users.",
    experience: [
      {
        role: "Frontend Engineer, Riverline Consumer Products (2020 - Present)",
        bullets: [
          "Drove the adoption of a shared design-system library across four product surfaces, cutting duplicate component implementations from an estimated 30+ down to a shared set of under 10.",
          "Led the diagnosis of a memory leak causing the app to slow down and eventually crash after extended use on low-end Android devices, tracing it to an event-listener cleanup bug in a widely reused component.",
          "Introduced a performance budget enforced in CI, blocking merges that would regress bundle size beyond an agreed threshold, after repeated unnoticed bundle-size creep.",
          "Regularly consulted by other frontend teams on architecture decisions outside her own team's direct scope.",
        ],
      },
      {
        role: "Frontend Engineer, Riverline Consumer Products (2018 - 2020)",
        bullets: [
          "Rebuilt the product's onboarding flow in React, improving completion rate through a series of usability fixes identified via session-replay analysis.",
          "Introduced end-to-end testing for critical user flows where none had previously existed.",
        ],
      },
    ],
    education: "B.Sc. in Computer Science, Cairo University",
    skills: "React, TypeScript, performance optimization, design systems, CI/CD, mentoring",
  },
  {
    file: "cv-025-mina-abdel-malak-b.pdf",
    name: "Mina Abdel Malak",
    title: "Frontend Developer",
    contact: "mina.abdelmalak.fe@example-mail.com | Cairo, Egypt",
    summary:
      "Frontend developer with 1 year of experience at PixelForge Studios, mainly working on small UI fixes and bug tickets.",
    experience: [
      {
        role: "Frontend Developer, PixelForge Studios (2022 - 2023)",
        bullets: [
          "Fixed small UI bugs reported by QA across the main product.",
          "Implemented a handful of well-specified UI components from Figma designs under a senior engineer's review.",
          "Assisted with basic CSS styling updates for a marketing landing page.",
        ],
      },
    ],
    education: "B.Sc. in Computer Science, Cairo University",
    skills: "React, CSS, basic TypeScript",
  },
];

const outDir = path.resolve("corpus/cvs");
const browser = await puppeteer.launch({ headless: "new" });
try {
  for (const cv of cvs) {
    const page = await browser.newPage();
    await page.setViewport({ width: 760, height: 200 });
    await page.setContent(htmlCv(cv), { waitUntil: "networkidle0" });
    const bodyHandle = await page.$("body");
    const box = await bodyHandle.boundingBox();
    await page.setViewport({ width: 760, height: Math.ceil(box.height) + 20 });
    const pngBytes = await page.screenshot({ type: "png", fullPage: true });
    await page.close();

    const pdf = await PDFDocument.create();
    const image = await pdf.embedPng(pngBytes);
    const pdfPage = pdf.addPage([image.width, image.height]);
    pdfPage.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    const pdfBytes = await pdf.save();
    await fs.writeFile(path.join(outDir, cv.file), pdfBytes);
    console.log("wrote", cv.file, `(${image.width}x${image.height})`);
  }
} finally {
  await browser.close();
}
