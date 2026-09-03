import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EvidenceExtractorInputSchema,
  RubricScorerInputSchema,
  ShortlistDrafterOutputSchema,
} from "../../src/contracts/agents.js";

test("RubricScorerInputSchema rejects a payload carrying a candidate name — the bias-safety schema exclusion", () => {
  const withNameLeaked = {
    candidateHandle: "CAND-07",
    rubricId: "rubric-1",
    fullName: "Jane Doe", // must never be accepted by this schema
    evidenceByCompetency: [
      {
        competencyId: "comp1",
        evidenceSnippets: [{ text: "Led a team of 5 engineers", sourceChunkId: "ch1" }],
        rubricCriteria: "Demonstrates leadership",
      },
    ],
  };

  assert.throws(() => RubricScorerInputSchema.parse(withNameLeaked));
});

test("RubricScorerInputSchema accepts a well-formed opaque-handle payload", () => {
  const valid = {
    candidateHandle: "CAND-07",
    rubricId: "rubric-1",
    evidenceByCompetency: [
      {
        competencyId: "comp1",
        evidenceSnippets: [{ text: "Led a team of 5 engineers", sourceChunkId: "ch1" }],
        rubricCriteria: "Demonstrates leadership",
      },
    ],
  };

  assert.doesNotThrow(() => RubricScorerInputSchema.parse(valid));
});

test("EvidenceExtractorInputSchema rejects a candidateHandle that isn't the opaque CAND-N format", () => {
  assert.throws(() =>
    EvidenceExtractorInputSchema.parse({ candidateHandle: "Jane Doe", competencyIds: ["comp1"] }),
  );
});

test("ShortlistDrafterOutputSchema requires between 2 and 3 interview probes per candidate", () => {
  const base = { candidateHandle: "CAND-07", rank: 1, summary: "Strong fit." };

  assert.throws(() =>
    ShortlistDrafterOutputSchema.parse({ shortlist: [{ ...base, interviewProbes: ["only one"] }] }),
  );
  assert.throws(() =>
    ShortlistDrafterOutputSchema.parse({
      shortlist: [{ ...base, interviewProbes: ["one", "two", "three", "four"] }],
    }),
  );
  assert.doesNotThrow(() =>
    ShortlistDrafterOutputSchema.parse({ shortlist: [{ ...base, interviewProbes: ["one", "two"] }] }),
  );
});
