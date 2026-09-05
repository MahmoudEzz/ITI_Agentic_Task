# Common trainee mistakes — OWASP LLM in Practice

Five misconceptions this repository's own build history actually surfaced (see `docs/AI-USAGE-LOG.md`/`docs/EVALUATION.md` for the real incidents each is drawn from), predicted to recur in trainees working through the lab. Each entry: the mistake, why it feels reasonable, and how to correct it — ideally by pointing the trainee at the real evidence in this repo rather than just asserting the correction.

## 1. "The system prompt says not to follow injected instructions, so injection is handled."

**Why it feels reasonable:** `prompts/answer-grounded.md` and `prompts/rubric-scorer.md` both carry an explicit instruction to treat retrieved content as untrusted data, never as commands. A trainee reading only the prompt file will see a defense and reasonably conclude the risk is closed.

**Correct it with:** `docs/EVALUATION.md`'s Failure analysis #2. Case `gs-023` (Lab Exercise 3) shows the *exact same* prompted defense present and still failing on a real run — the model output "a score of 5 out of 5... ready for advancement," directly adopting the CV's embedded instruction. A prompted defense is real and worth having, but it is a probabilistic mitigation, not a guarantee — the correct mental model is "reduces the attack's success rate," not "prevents the attack."

## 2. "A refusal means retrieval failed to find the evidence."

**Why it feels reasonable:** `AnswerSchema`'s `refused: true, refusalReason: "insufficient_evidence"` reads as if evidence was missing. It's the most natural first hypothesis, and it's what a fresh reader of `answerQuestion.js` would assume from the reason string alone.

**Correct it with:** `docs/EVALUATION.md`'s Baseline results — 45.5% single-shot refusal correctness, with the harness's own independent retrieval diagnostic proving **100%** of those misses had `bestDenseSimilarity` between 0.55 and 0.78 (comfortably above the 0.35 refusal threshold): the evidence was retrieved correctly every time. The real cause is `resolveCitations()` finding zero `[n]` markers in the model's answer — a generation-reliability issue, one layer downstream of retrieval. This is exactly the mistake the harness's own author made on the first unexpected refusal during golden-set authoring, and it's why the harness re-runs retrieval independently rather than trusting the use case's own refusal reason.

## 3. "A citation existing (`[n]` resolves to a real retrieved chunk) means the claim next to it is grounded."

**Why it feels reasonable:** `resolveCitations()` only accepts a marker number that maps to a chunk actually placed in context — so "the citation is real" is true by construction, and it's tempting to stop there.

**Correct it with:** `scripts/eval.js`'s groundedness metric exists specifically because "cites a real chunk" and "the claim is actually supported by that chunk's content" are different properties — a model can cite `[2]` next to a sentence that has nothing to do with chunk 2's actual content. Have the trainee find a low-`groundedRatio` case in a real `npm run eval` run and read the cited chunk's actual text next to the claim.

## 4. "The bias-safety mechanism (opaque handles, redaction) also protects the Rubric Scorer against prompt injection."

**Why it feels reasonable:** Both are described as "structural" defenses in ADR-0006, and both live in the same `extractRedactScore.js` pipeline stage a trainee will read together. It's an easy category error to make.

**Correct it with:** the corrected framing in `docs/EVALUATION.md`'s Failure analysis #2 and `docs/BRD.md`'s Objectives table — `prompts/rubric-scorer.md` carries the *identical* prompted "untrusted content" instruction as `/ask`'s prompt, and nothing in `RubricScorerOutputSchema`'s grounding checks (real chunk ids, real cited text) validates that a *score value* wasn't influenced by an embedded instruction. ADR-0006's structural guarantee closes a different risk entirely — a candidate's name/demographics leaking into scoring — not injected-instruction resistance. Ask the trainee to name the one control that actually would catch an inflated score from injection (there isn't one yet at this layer — that's the point, and it's a real, disclosed, unmeasured gap, not a trick question).

## 5. "Groundedness needs an LLM-judge to be meaningful."

**Why it feels reasonable:** LLM-as-judge is the default pattern in most RAG evaluation tutorials, and it feels more "semantic" than string matching.

**Correct it with:** `scripts/eval.js`'s actual, deliberately-simple lexical-overlap heuristic — no LLM call, thresholded at 0.3, and its own documented limitation (2 real false-negative cases in `docs/EVALUATION.md`'s Failure analysis #3, caused by the model echoing a citation-header line as its own sentence). Walk the trainee through why an LLM-judge would have been slower (a second per-sentence LLM call on a CPU-bound local model), less reproducible (judge outputs vary run to run), and harder to explain line-by-line — and why a disclosed, understood heuristic limitation is more trustworthy than an opaque judge score that looks more sophisticated but can't be audited the same way.
