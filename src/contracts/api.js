import { z } from "zod";
import { APPROVAL_DECISIONS } from "../domain/entities/Approval.js";

export const LoginRequestSchema = z
  .object({
    email: z.string().min(1),
    password: z.string().min(1),
  })
  .strict();

export const AskRequestSchema = z
  .object({
    question: z.string().min(1),
    topK: z.number().int().positive().max(50).optional(),
    candidateHandle: z.string().optional(),
    documentType: z.string().optional(),
    section: z.string().optional(),
  })
  .strict();

export const StartRunRequestSchema = z
  .object({
    roleId: z.string().min(1),
    rubricId: z.string().min(1),
    candidateHandles: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const DecisionRequestSchema = z
  .object({
    decision: z.enum(APPROVAL_DECISIONS),
    comment: z.string().optional().nullable(),
    editDiff: z.record(z.string(), z.unknown()).optional().nullable(),
    finalShortlist: z
      .array(z.object({ candidateHandle: z.string().min(1), rank: z.number().int().positive() }))
      .optional()
      .nullable(),
  })
  .strict();
