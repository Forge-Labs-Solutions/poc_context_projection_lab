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
