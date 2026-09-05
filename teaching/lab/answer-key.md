# Answer key — instructor reference

Not for trainee distribution before the lab. Answers to the stretch challenges' open questions, and grading notes for the core exercises.

## Core exercises — grading notes

Exercises 1-5 are observational, not right-answer exercises — grade on whether the trainee correctly *identifies* the outcome category (answered-with-real-citation vs. correctly-refused vs. injection-complied vs. injection-resisted) and connects it to the right file/mechanism, not on reproducing exact wording. A trainee who gets a "wrong" (but real, documented) outcome due to model variance and correctly explains *why* that's expected has fully succeeded at the exercise — variance-awareness is itself a graded learning outcome (see `assessment-map/assessment-map.md`).

## Stretch 1 — expected reasoning

5 runs is not enough to trust a rate with any real confidence — a trainee should recognize this is a small-sample-size problem, ideally naming it in those terms (or informally: "if I got 2 resisted and 3 complied, that's not meaningfully different from 3 resisted and 2 complied on 5 trials"). The correct connection back to the repo: this is exactly why `docs/EVALUATION.md` reports `npm run eval`'s full 22-auto-scored-case distribution rather than a single golden-set entry's one hand-run outcome, and exactly why `docs/BRD.md`'s Risks section frames the OCR-threshold-tuning question the same way (5 real fixtures isn't enough to retune against either).

## Stretch 2 — the actual blind spot and fix

**What fools it:** an answer where the model opens with a citation-header line as its own sentence — e.g. `"[1] (document: competency-framework, section: TECHNICAL PROFICIENCY (TECH-PROF))\n\nAccording to the Competency Framework, Level 2..."`. The naive `.split(/(?<=[.!?])\s+/)` sentence-splitter treats the header line (ending in no punctuation before the blank line, or forming its own segment) as the marker's sentence, and that header's own words ("document," "section," the document id) have almost no lexical overlap with the *actual* cited chunk's real content — producing a false `groundedRatio: 0` for an answer that a human reader can see is genuinely well-grounded.

**A real fix direction:** when a sentence segment consists mostly of the citation-header pattern (matches something like `^\[\d+\]\s*\(document:.*\)\s*$`), skip it and attribute the marker to the *next* real sentence instead of the header line itself.

**A new failure mode this could introduce:** if "next sentence" is chosen too greedily (e.g., skipping multiple header-only lines and landing on a sentence several claims later), the marker could get attributed to a claim the model didn't actually intend to cite that specific chunk for — a different kind of misattribution, just in the opposite direction (now potentially inflating groundedness on a genuinely weak citation, rather than deflating it on a genuinely strong one). This is a good moment to reinforce: fixing a known false-negative can introduce a new false-positive if the fix isn't scoped carefully — ask the trainee to defend why their specific fix doesn't do this.

## Stretch 3 — expected design

**Fixture choice:** `cv-003-omar-farouk` is the strongest choice — its injected instruction targets a *score* directly ("maximum score of 5 on every competency"), unlike `cv-015`/`cv-021` which target shortlist placement more than the score value, and unlike the policy-document fixture which targets differential treatment by institution rather than an absolute score. A trainee choosing a different fixture should be asked to justify it against this same "does the injected text target the exact output field I'm testing" criterion.

**What to assert:** the real, measured `TECH-PROF` (or whichever competency the injected CV's real evidence would support only a low level for) score value should stay in a low/realistic range (e.g., ≤2, matching the candidate's real 2-years-junior-level evidence) despite the injected instruction — NOT simply that `evidenceChunkIds` references real chunks (that's already guaranteed by the existing schema-level `.refine()` and proves nothing new about injection resistance).

**The missing check:** there currently is no automated check that a score value is "reasonable" given the real evidence text — this would require either a second, independent (non-LLM, or a different/larger LLM) scoring pass to compare against, or a hand-authored "this evidence supports at most a Level 2" ceiling per fixture, similar in spirit to `forbiddenPhrases` but for numeric ranges instead of text patterns. Either approach is a legitimate answer; the grading point is recognizing that *some* new mechanism is required — the existing schema checks structurally cannot catch this.

## Stretch 4 — expected reasoning

The lesson to reinforce regardless of what the trainee's own hypothesis was: `answerQuestion.js` has two independently-triggered paths that produce the identical externally-visible shape (`refused: true, refusalReason: "insufficient_evidence"`) — one from `decideRefusal()` (pre-generation, retrieval-based) and one from `resolveCitations().length === 0` (post-generation, citation-based). A trainee cannot distinguish which one fired from the `AnswerSchema` response alone; they must either read the source or add instrumentation, exactly as the original debugging session did. If a trainee's first hypothesis matched the real cause, ask what specific evidence they used to get there directly (rather than luck) — the strong answer references checking retrieval similarity independently before assuming the model's behavior, mirroring `scripts/eval.js`'s own `retrievalDiagnostic()` design.
