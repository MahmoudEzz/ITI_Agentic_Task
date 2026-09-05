import { z } from "zod";

// Every field here is deliberate. In particular, RubricScorerInputSchema is
// `.strict()` and has no field capable of carrying a name or raw CV text —
// this is the schema-level half of the bias-safety design (ADR-0006,
// docs/SECURITY.md). The pure-function half is
// src/domain/services/redactProtectedAttributes.js (Phase 1, issue #8).

const EvidenceSnippetSchema = z
  .object({
    text: z.string().min(1),
    sourceChunkId: z.string().min(1),
  })
  .strict();

export const EvidenceExtractorInputSchema = z
  .object({
    candidateHandle: z.string().regex(/^CAND-\d+$/),
    competencyIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const EvidenceExtractorOutputSchema = z
  .object({
    evidenceByCompetency: z
      .array(
        z
          .object({
            competencyId: z.string().min(1),
            snippets: z.array(EvidenceSnippetSchema).min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const RubricScorerInputSchema = z
  .object({
    candidateHandle: z.string().regex(/^CAND-\d+$/),
    rubricId: z.string().min(1),
    evidenceByCompetency: z
      .array(
        z
          .object({
            competencyId: z.string().min(1),
            evidenceSnippets: z.array(EvidenceSnippetSchema).min(1),
            rubricCriteria: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const RubricScorerOutputSchema = z
  .object({
    scores: z
      .array(
        z
          .object({
            competencyId: z.string().min(1),
            value: z.number(),
            rationale: z.string().min(1),
            evidenceChunkIds: z.array(z.string().min(1)).min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const ShortlistDrafterInputSchema = z
  .object({
    roleId: z.string().min(1),
    candidates: z
      .array(
        z
          .object({
            candidateHandle: z.string().regex(/^CAND-\d+$/),
            compositeScore: z.number(),
            scores: RubricScorerOutputSchema.shape.scores,
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const ShortlistDrafterOutputSchema = z
  .object({
    shortlist: z
      .array(
        z
          .object({
            candidateHandle: z.string().regex(/^CAND-\d+$/),
            rank: z.number().int().positive(),
            summary: z.string().min(1),
            interviewProbes: z.array(z.string().min(1)).min(2).max(3),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
