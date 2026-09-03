# AI Usage Log

> Honest record of what was delegated to AI, what was written manually, where the AI misled the developer, and how each was verified. An entry claiming flawless AI usage is a red flag, not a success — this log is expected to contain real mistakes.

## 2026-09-03 — Requirements analysis, variant derivation, and Phase 0 scaffolding

**Delegated to AI (Claude Code):**
- Full reading and structuring of the assessment PDF (`ITI-Instructor-Task.pdf`) into a condensed requirements brief.
- Derivation arithmetic for the assigned variant from the National ID (`29307051603297`): last-two-digits mod 7 for Domain, digit-sum mod 8 for Twist.
- Draft architecture, corpus, orchestration, security, and phased-build design (via a Plan sub-agent), covering FR-1 through FR-9, security controls, and the D6/T6-specific bias and OCR mechanisms.
- Generation of Phase 0 scaffolding: folder structure, `.gitignore`, `LICENSE`, `package.json`, doc skeletons (`BRD.md`, `SYSTEM-DESIGN.md`, `ARCHITECTURE.md`, `SECURITY.md`, `EVALUATION.md`, `AGENTIC-WORKFLOW.md`, this log), and 5 ADRs.

**Written/decided manually (by the developer, in conversation with the AI):**
- The actual National ID used for derivation.
- Tech stack (Node.js/JavaScript, not TypeScript).
- LLM provider choice (Ollama primary + Gemini secondary, explicitly rejecting a mock-only "second implementation" as insufficient).
- UI surface decision — an initial request for a Streamlit UI was corrected after the AI flagged it as incompatible with the Node.js stack (Streamlit is Python-only); resolved to a minimal static HTML/JS UI in the same repo instead of switching the whole backend to Python.
- T6 output-format scope (both DOCX and PDF, not DOCX-only).

**Where the AI needed correction:**
- The AI's first-pass UI question offered CLI/TUI vs. minimal-web-UI as the choices; when the developer asked for Streamlit, the AI did not silently attempt to bolt Python onto a Node.js repo — it surfaced the language mismatch explicitly and asked how to resolve it, rather than guessing. Recorded here as a case where the correction happened *before* wasted implementation, which is the outcome this log is meant to encourage more of, not evidence that no correction was ever needed elsewhere in the build.

**Verification:**
- Variant derivation arithmetic (97 mod 7 = 6; 54 mod 8 = 6) checked by hand against the brief's stated formula before being treated as final.
- Architecture/ADR content was reviewed by the developer for internal consistency (e.g. the orchestration ADR and the sequence-diagram placeholder in `ARCHITECTURE.md` describe the same state machine) before being committed, not committed unread.

## 2026-09-03 — Bulk chat log preservation

_TODO if applicable: if this conversation's full transcript is exported and included as supplementary evidence for the teaching pack or AI-usage narrative, note it here with its location._
