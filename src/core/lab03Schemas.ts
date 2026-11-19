import { z } from "zod";

export const parseFcasSchema = z.object({
  fcas: z.string().min(4),
});

export const resolveFcasSchema = z.object({
  fcas: z.string().min(4),
});

export const createReferenceSchema = z.object({
  sourceFcid: z.string().min(1),
  fcas: z.string().min(4),
});

export const projectFcidToFcasSchema = z.object({
  targetFcid: z.string().min(1),
});

export const renameSchema = z
  .object({
    fcid: z.string().min(1),
    resourceKey: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
  })
  .refine((value) => value.resourceKey !== undefined || value.title !== undefined, { message: "Give a resourceKey, a title or both" });

export const moveSchema = z.object({
  fcid: z.string().min(1),
  newParentFcid: z.string().min(1),
});

export const reorderSchema = z.object({
  parentFcid: z.string().min(1),
  childFcids: z.array(z.string().min(1)).max(5000),
});
