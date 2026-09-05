import { z } from "zod";
import { APPROVAL_DECISIONS } from "../domain/entities/Approval.js";

export const LoginRequestSchema = z
  .object({
    email: z.string().min(1),
    password: z.string().min(1),
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
