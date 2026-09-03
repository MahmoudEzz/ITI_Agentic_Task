import { z } from "zod";
import { NotFoundError } from "../domain/errors/index.js";

// The >=4 tools required by FR-4. isWrite marks the ones that must never
// execute without a passed approval gate (FR-4/FR-5) — the orchestrator
// checks this flag, not the tool's name, before invoking it.

const ChunkResultSchema = z
  .object({
    chunkId: z.string().min(1),
    documentId: z.string().min(1),
    content: z.string().min(1),
    score: z.number(),
    section: z.string().nullable(),
    page: z.number().int().nullable(),
    ocrConfidence: z.number().min(0).max(100).nullable(),
  })
  .strict();

export const SearchCorpusInputSchema = z
  .object({
    query: z.string().min(1),
    topK: z.number().int().positive().max(50).default(8),
    documentType: z.string().optional(),
  })
  .strict();

export const SearchCorpusOutputSchema = z
  .object({
    results: z.array(ChunkResultSchema),
  })
  .strict();

export const GetCandidateChunksInputSchema = z
  .object({
    candidateHandle: z.string().regex(/^CAND-\d+$/),
    section: z.string().optional(),
  })
  .strict();

export const GetCandidateChunksOutputSchema = z
  .object({
    chunks: z.array(ChunkResultSchema),
  })
  .strict();

export const FinalizeShortlistInputSchema = z
  .object({
    runId: z.string().min(1),
    approvalId: z.string().min(1),
    shortlist: z.array(z.object({ candidateHandle: z.string().regex(/^CAND-\d+$/), rank: z.number().int().positive() }).strict()).min(1),
  })
  .strict();

export const FinalizeShortlistOutputSchema = z
  .object({
    shortlistId: z.string().min(1),
    finalizedAt: z.string().datetime(),
  })
  .strict();

export const GenerateReportInputSchema = z
  .object({
    runId: z.string().min(1),
    approvalId: z.string().min(1),
    format: z.enum(["docx", "pdf"]),
  })
  .strict();

export const GenerateReportOutputSchema = z
  .object({
    assetId: z.string().min(1),
    format: z.enum(["docx", "pdf"]),
    generatedAt: z.string().datetime(),
  })
  .strict();

export const TOOL_REGISTRY = Object.freeze({
  search_corpus: Object.freeze({
    inputSchema: SearchCorpusInputSchema,
    outputSchema: SearchCorpusOutputSchema,
    isWrite: false,
  }),
  get_candidate_chunks: Object.freeze({
    inputSchema: GetCandidateChunksInputSchema,
    outputSchema: GetCandidateChunksOutputSchema,
    isWrite: false,
  }),
  finalize_shortlist: Object.freeze({
    inputSchema: FinalizeShortlistInputSchema,
    outputSchema: FinalizeShortlistOutputSchema,
    isWrite: true,
  }),
  generate_report: Object.freeze({
    inputSchema: GenerateReportInputSchema,
    outputSchema: GenerateReportOutputSchema,
    isWrite: true,
  }),
});

export function getToolDefinition(toolName) {
  const definition = TOOL_REGISTRY[toolName];
  if (!definition) throw new NotFoundError("Tool", toolName);
  return definition;
}
