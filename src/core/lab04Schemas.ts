import { z } from "zod";

const fcid = z.string().min(1);

export const editSchema = z
  .object({
    fcid,
    text: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
  })
  .refine((v) => (v.text === undefined) !== (v.title === undefined), {
    message: "Provide exactly one of text or title",
  });

export const semanticChangeSchema = z.object({
  fcid,
  text: z.string().min(1),
});

export const classifySchema = z.object({
  fcid,
  text: z.string().min(1),
});

export const splitSchema = z
  .object({
    fcid,
    parts: z.array(z.string().min(1)).min(2).optional(),
    boundaries: z.array(z.number().int().positive()).min(1).optional(),
  })
  .refine((v) => (v.parts === undefined) !== (v.boundaries === undefined), {
    message: "Provide exactly one of parts (SN) or boundaries (PG, MS)",
  });

export const mergeSchema = z.object({
  fcids: z.array(fcid).min(2),
});

export const regenerateSchema = z.object({
  fcid,
  text: z.string().min(1),
});
