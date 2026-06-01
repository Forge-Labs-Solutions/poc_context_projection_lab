import { z } from "zod";

export const artifactCategorySchema = z.enum(["structural", "cognitive"]);

export const artifactSchema = z.object({
  fcid: z.string(),
  type: z.string(),
  category: artifactCategorySchema,
  state: z.string(),
  metadataJson: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const edgeSchema = z.object({
  parentFcid: z.string(),
  childFcid: z.string(),
  relationType: z.string(),
  orderIndex: z.number(),
});

export const projectionSchema = z.object({
  projectionId: z.string(),
  kind: z.string(),
  rootFcid: z.string(),
  sourceRef: z.string().nullable(),
  status: z.string(),
  metadataJson: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const referenceSchema = z.object({
  referenceId: z.string(),
  sourceFcid: z.string(),
  fcasRaw: z.string(),
  targetFcid: z.string(),
  status: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type ArtifactDto = z.infer<typeof artifactSchema>;
export type EdgeDto = z.infer<typeof edgeSchema>;
export type ProjectionDto = z.infer<typeof projectionSchema>;
export type ReferenceDto = z.infer<typeof referenceSchema>;
