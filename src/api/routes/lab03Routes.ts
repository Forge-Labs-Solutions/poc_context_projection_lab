import type { FastifyInstance } from "fastify";
import {
  createReferenceSchema,
  parseFcasSchema,
  projectFcidToFcasSchema,
  resolveFcasSchema,
} from "../../core/lab03Schemas.js";
import {
  createReferenceArtifact,
  FcasAmbiguousError,
  parseFcas,
  projectFcidToFcas,
  resolveFcasToFcid,
} from "../../core/lab03Service.js";

export function registerLab03Routes(app: FastifyInstance): void {
  app.post("/v1/lab03/parse", async (request, reply) => {
    const parsed = parseFcasSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    try {
      return { data: parseFcas(parsed.data.fcas) };
    } catch {
      return reply.code(400).send({ error: "Invalid FCAS syntax" });
    }
  });

  app.post("/v1/lab03/resolve", async (request, reply) => {
    const parsed = resolveFcasSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    try {
      const result = await resolveFcasToFcid(parsed.data.fcas);
      return { data: result };
    } catch (error) {
      if (error instanceof Error && error.message === "FCAS_INVALID") {
        return reply.code(400).send({ error: "Invalid FCAS syntax" });
      }
      if (error instanceof FcasAmbiguousError) {
        return reply.code(409).send({
          error: "FCAS target was split; resolution is ambiguous",
          details: { originalFcid: error.originalFcid, candidates: error.candidates },
        });
      }
      return reply.code(404).send({ error: "FCAS target not found" });
    }
  });

  app.post("/v1/lab03/references", async (request, reply) => {
    const parsed = createReferenceSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    try {
      const result = await createReferenceArtifact(parsed.data);
      return { data: result };
    } catch (error) {
      if (error instanceof Error && error.message === "SOURCE_NOT_FOUND") {
        return reply.code(404).send({ error: "Source artifact not found" });
      }
      if (error instanceof FcasAmbiguousError) {
        return reply.code(409).send({
          error: "FCAS target was split; resolution is ambiguous",
          details: { originalFcid: error.originalFcid, candidates: error.candidates },
        });
      }
      return reply.code(404).send({ error: "FCAS target not found" });
    }
  });

  app.post("/v1/lab03/project-fcas", async (request, reply) => {
    const parsed = projectFcidToFcasSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    try {
      const fcas = await projectFcidToFcas(parsed.data.targetFcid);
      return { data: { targetFcid: parsed.data.targetFcid, fcas } };
    } catch {
      return reply.code(404).send({ error: "FCID not found" });
    }
  });
}
