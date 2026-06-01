import type { FastifyInstance } from "fastify";
import { projectArtifactSchema } from "../../core/lab02Schemas.js";
import { projectArtifact } from "../../core/projectionService.js";

export function registerLab02Routes(app: FastifyInstance): void {
  app.post("/v1/lab02/project", async (request, reply) => {
    const parsed = projectArtifactSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      const result = await projectArtifact(parsed.data.artifactFcid, parsed.data.targetFormat);
      return { data: result };
    } catch (error) {
      if (error instanceof Error && error.message === "ARTIFACT_NOT_FOUND") {
        return reply.code(404).send({ error: "Artifact not found" });
      }
      if (error instanceof Error && error.message === "UNSUPPORTED_SCOPE") {
        return reply.code(409).send({ error: "Artifact type not projectable in Lab 02" });
      }
      return reply.code(500).send({ error: "Projection failed" });
    }
  });
}
