import { z } from "zod";

export const projectionFormatSchema = z.enum(["markdown", "text", "json"]);

export const projectArtifactSchema = z.object({
  artifactFcid: z.string().min(1),
  targetFormat: projectionFormatSchema.optional().default("markdown"),
});

export type ProjectionFormat = z.infer<typeof projectionFormatSchema>;
