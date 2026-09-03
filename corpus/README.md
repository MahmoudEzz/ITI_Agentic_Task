# corpus

Synthetic seed documents for the D6 (HR talent screening) domain pack, tracked in `manifest.json` (per-document id, type, page count and counting method, source format, `ocrRequired` flag, `fixtures` array for adversarial/bias/injection cases).

**Fictional company: Northfield Digital.** All content — names, companies, policies, CVs — is synthetic, generated for this assessment. No real personal data.

## Composition (42 documents, ~69 pages by the manifest's word-count/actual-page method)

| Directory | Contents |
|---|---|
| `job-descriptions/` | 3 role JDs (Backend Engineer, Data Analyst, Frontend Engineer) |
| `competency-framework/` | 1 doc defining 8 competencies with 5 behavioral-anchor levels each, plus 3 appendices |
| `rubrics/` | 3 role-specific rubrics, each with a worked composite-score example |
| `policies/` | 6 policy/reference docs (Interview Process Playbook — contains the indirect prompt-injection fixture — Diversity & Anti-Bias Hiring, Compensation Bands & Leveling, Candidate Data Handling & Privacy, Remote Compensation Addendum, Standard Interview Question Bank) plus 3 role-specific Technical Interview Guides |
| `onboarding/` | 1 doc (Onboarding & Offer Process) |
| `cvs/` | 25 CVs across 3 formats + a scanned/no-text-layer format: 13 `.txt`, 5 `.docx`, 2 native-text `.pdf`, 5 scanned (image-only) `.pdf` |

CV fixtures: 3 bias cases (gender/marital, religion/graduation-year, nationality/native-speaker), 4 prompt-injection cases (3 CVs incl. one white-on-white hidden text in a `.docx`, plus the 1 indirect injection in a policy document), 2 conflicting-pair CVs (same candidate, contradictory claims, one `.docx` + one scanned `.pdf`), 5 OCR fixtures (scanned, ~0 extractable text, verified with `pdf-parse`).

`generation-scripts/` holds the one-off scripts used to build the binary CVs and this manifest — not part of the application.

**Known gap:** total page count (~69) falls short of the brief's 150-page target, despite substantially expanding the policy/framework/rubric documents beyond their original scope during authoring. Closing the remaining gap would mean either accepting less realistic (artificially padded) CVs/policies, or adding more documents — left as a follow-up rather than padded to hit a number. See the corpus-authoring PR description for the honest accounting.

See `docs/AI-USAGE-LOG.md` for how this content was generated and verified, and `docs/BRD.md` for the corpus composition rationale.
