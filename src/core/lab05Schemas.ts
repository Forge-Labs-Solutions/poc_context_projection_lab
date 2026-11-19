import { z } from "zod";

const maxDepth = z.number().int().min(1).max(5).default(3);
const format = z.enum(["markdown", "text"]).default("markdown");

export const assembleSchema = z.object({
  target: z.string().min(1),
  // Range bounds are validated by the service so invalid windows return 422 INVALID_RANGE.
  range: z
    .object({
      from: z.number().int(),
      to: z.number().int().optional(),
    })
    .optional(),
  roles: z.array(z.enum(["user", "assistant", "system"])).min(1).optional(),
  expand: z.boolean().default(true),
  maxDepth,
  format,
});

export const expandSchema = z.object({
  text: z.string(),
  maxDepth,
  format,
});
