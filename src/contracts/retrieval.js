import { z } from "zod";

// Typed I/O for the Q&A use case (FR-2). CitationSchema deliberately mirrors
// only the fields needed to prove provenance (resolve to an actually
// retrieved chunk, document, section, page) — never the full chunk content,
// so a citation can't smuggle raw corpus text past whatever renders it.

export const RetrievalQuerySchema = z
  .object({
    question: z.string().min(1),
    topK: z.number().int().positive().max(50).optional(),
    candidateId: z.string().optional(),
    documentType: z.string().optional(),
    section: z.string().optional(),
  })
  .strict();

export const CitationSchema = z
  .object({
    chunkId: z.string().min(1),
    documentId: z.string().min(1),
    section: z.string().nullable().optional(),
    page: z.number().int().nullable().optional(),
  })
  .strict();

// `refused: true` responses carry no citations and no fabricated answer
// text — `answer` is null, `refusalReason` is set. This shape makes
// "the system refused" and "the system answered" mutually exclusive at the
// type level, not just by convention.
export const AnswerSchema = z
  .discriminatedUnion("refused", [
    z
      .object({
        refused: z.literal(false),
        answer: z.string().min(1),
        citations: z.array(CitationSchema).min(1),
      })
      .strict(),
    z
      .object({
        refused: z.literal(true),
        answer: z.null(),
        refusalReason: z.enum(["insufficient_evidence"]),
      })
      .strict(),
  ])
  .describe("AnswerSchema");
