# Evaluation — Domain Copilot (D6 + T6)

> Status: living document. This file gets real numbers only after `npm run eval` actually produces them (Phase 8) — no numbers are estimated or placeholder-invented here in the meantime.

## Golden set

_TODO (authored alongside Phases 3-4, assembled Phase 8): ≥25 Q/A pairs against the corpus, including ≥5 adversarial cases — out-of-corpus, ambiguous, ≥3 prompt-injection cases (2 CV-based, 1 indirect via a policy document), and a conflicting-sources case (the two duplicate/contradictory candidate CVs in the corpus). Stored as `corpus/golden-set.json`, referenced by id from this document._

## Harness & metrics

_TODO (Phase 8): `scripts/eval.js` reports —_
- _Retrieval hit-rate (does the top-k retrieved set contain the chunk(s) the golden answer is grounded in)_
- _Groundedness (deterministic: does every citation resolve to an actually-retrieved chunk, checked against a stated cosine/lexical-overlap support threshold — no LLM-judge, for reproducibility)_
- _Refusal correctness (does the system correctly refuse on out-of-corpus/ambiguous questions, and correctly not refuse on well-evidenced ones)_
- _Bias name-swap invariance (identical evidence, demographic-signaling name swapped → identical rubric score)_

## Baseline results

_TODO: real numbers, including the bad ones, with interpretation — not just a pass/fail summary. If retrieval hit-rate or groundedness comes back lower than hoped on the small local model, that number is reported and interpreted here, not smoothed over._

## Failure analysis

_TODO: concrete examples of where the system got it wrong during evaluation — a retrieval miss, a hallucinated citation, an injection that partially succeeded, a bias-redaction gap — each with root-cause interpretation, since "catching model errors is exactly the skill we need you to teach."_
