# Assessment map — learning outcomes

Maps each learning outcome to where it's taught (slide/lab reference) and how it's assessed. Every outcome below is checkable against something the trainee actually produced or observed, not just self-reported understanding.

| # | Learning outcome | Taught in | Assessed by |
|---|---|---|---|
| LO1 | Explain the difference between direct and indirect prompt injection, and identify a real indirect-injection example in a retrieved document | Slides: "LLM01 — the textbook version," "LLM01 in this repo" · Lab: Exercises 3-4 | Trainee correctly identifies the injected paragraph in `cv-003-omar-farouk.docx` (Exercise 4) and correctly labels it as indirect (document-embedded), not direct (user-typed) |
| LO2 | Recognize that a prompted defense is a probabilistic mitigation, not a guarantee, and support that claim with a real measured number | Slides: "LLM01 — did the defense hold?" · Lab: Exercise 3, Stretch 1 | Trainee's Exercise 3 write-up states the observed outcome category (complied/resisted/refused) and correctly frames a single run as inconclusive on its own — full credit requires citing `docs/EVALUATION.md`'s real number, not just personal impression |
| LO3 | Distinguish a structural (schema/code-level) security guarantee from a prompted (natural-language) one, and correctly identify which risk each one actually closes | Slides: "LLM01 — the mistake this repo's own build made" · `common-trainee-mistakes.md` #4 | Trainee can explain, in their own words, why ADR-0006's opaque-handle/redaction mechanism does not protect against score-inflating injection — checked via a short written or verbal explanation, not multiple choice |
| LO4 | Explain why a refusal is not proof that retrieval failed, and locate the actual mechanism that determines the real cause | Slides: "LLM09: Overreliance" · Lab: Exercise 2, Stretch 4 · `common-trainee-mistakes.md` #2 | Stretch 4's write-up correctly identifies which of `answerQuestion.js`'s two refusal paths fired for their reproduced case, with evidence (not a guess) |
| LO5 | Explain why "a citation exists" and "the claim is grounded" are different properties, and find a real case where they diverge | Slides: "LLM09" (implicit), `common-trainee-mistakes.md` #3 · Lab: Stretch 2 | Stretch 2's answer correctly identifies the citation-header-line false-negative pattern in `scripts/eval.js`, from reading the code, not from being told the answer first |
| LO6 | Articulate why a deterministic, no-LLM-judge evaluation metric is a legitimate design choice, not a corner cut | Slides: "LLM09," `common-trainee-mistakes.md` #5 | Trainee gives at least 2 concrete reasons (reproducibility, latency/cost, auditability) and can name the real disclosed limitation this specific harness's choice produces (the header-line false negative) |
| LO7 | Design a new, well-scoped evaluation case for a real, disclosed, currently-unmeasured risk | Lab: Stretch 3 | Stretch 3's proposed test names a specific fixture, a specific measurable assertion (not just "check it's not biased"), and correctly identifies that the existing schema checks cannot catch a score-value manipulation |
| LO8 | Read a real trace of a multi-step agent pipeline (SSE progress events or `trace_events` rows) and explain what each span represents | Slides: "The system under study" · README's `/runs` SSE example | Trainee can annotate a real captured `/runs` SSE transcript (provided by instructor, or their own from running it) span-by-span |

## Mapping to the OWASP LLM Top 10

| OWASP item | Covered by | Depth |
|---|---|---|
| LLM01 Prompt Injection | LO1, LO2, LO3, LO7 | Deep — real fixtures, real measured numbers, a real corrected misconception |
| LLM06 Sensitive Information Disclosure | Slides: "LLM06" section | Deep — real redaction test, real name-swap invariance measurement |
| LLM08 Excessive Agency | Slides: "LLM08" section | Moderate — tool allow-list + approval gate walkthrough, no dedicated lab exercise |
| LLM09 Overreliance | LO4, LO5, LO6 | Deep — this is where most of the lab's debugging-mindset exercises live |
| LLM10 (unbounded consumption) | Slides: "Unbounded Consumption" section | Light — real controls named, no lab exercise |
| LLM02, 03, 04, 05, 07 | Slide list only | Named, not deep-dived — honestly out of this session's 90-minute scope given the depth given to LLM01/06/09 |
