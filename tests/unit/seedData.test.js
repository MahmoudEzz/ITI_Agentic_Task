import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { COMPETENCIES, RUBRICS } from "../../src/infra/db/seed.js";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("importing seed.js for its data has no side effect of touching a database", () => {
  // If this test file itself is running, the import above already succeeded
  // without a DATABASE_URL/TEST_DATABASE_URL being resolved — the assertion
  // is that no exception was thrown getting here.
  assert.ok(Array.isArray(COMPETENCIES) && COMPETENCIES.length > 0);
});

test("every seeded rubric's weights sum to exactly 1", () => {
  for (const rubric of RUBRICS) {
    const sum = rubric.competencyWeights.reduce((total, w) => total + w.weight, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `${rubric.id} weights sum to ${sum}, not 1`);
  }
});

test("every competency id referenced by a rubric is a seeded competency", () => {
  const competencyIds = new Set(COMPETENCIES.map((c) => c.id));
  for (const rubric of RUBRICS) {
    for (const { competencyId } of rubric.competencyWeights) {
      assert.ok(competencyIds.has(competencyId), `${rubric.id} references unknown competency ${competencyId}`);
    }
  }
});

test("seeded competency ids match the identifiers the corpus competency framework actually names", async () => {
  const frameworkText = await readFile(path.join(repoRoot, "corpus", "competency-framework", "competency-framework.txt"), "utf-8");
  for (const { id } of COMPETENCIES) {
    assert.ok(frameworkText.includes(id), `seeded competency id ${id} does not appear in the corpus competency framework`);
  }
});

test("each seeded rubric's weights match the corpus rubric document's own COMPETENCY WEIGHTS table", async () => {
  const fileByRole = {
    "backend-engineer": "rubric-backend-engineer.txt",
    "data-analyst": "rubric-data-analyst.txt",
    "frontend-engineer": "rubric-frontend-engineer.txt",
  };

  for (const rubric of RUBRICS) {
    const text = await readFile(path.join(repoRoot, "corpus", "rubrics", fileByRole[rubric.roleId]), "utf-8");
    for (const { competencyId, weight } of rubric.competencyWeights) {
      // The corpus table format is "| Name (ID) | 0.NN |" — assert the exact
      // weight for this id appears somewhere on a line naming that id.
      const idLine = text.split("\n").find((line) => line.includes(`(${competencyId})`));
      assert.ok(idLine, `${rubric.id}: no corpus table row found for ${competencyId}`);
      assert.ok(idLine.includes(weight.toFixed(2)), `${rubric.id}: corpus row for ${competencyId} does not show weight ${weight.toFixed(2)} — got: ${idLine}`);
    }
  }
});
