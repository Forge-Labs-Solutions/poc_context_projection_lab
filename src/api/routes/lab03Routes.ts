import type { FastifyInstance, FastifyReply } from "fastify";
import {
  createReferenceSchema,
  moveSchema,
  parseFcasSchema,
  projectFcidToFcasSchema,
  renameSchema,
  reorderSchema,
  resolveFcasSchema,
} from "../../core/lab03Schemas.js";
import {
  Lab035Error,
  type Lab035ErrorCode,
  moveArtifact,
  referenceStatus,
  refreshReference,
  renameResource,
  reorderChildren,
} from "../../core/lab035Service.js";
import {
  createReferenceArtifact,
  FcasAmbiguousError,
  FcasNameAmbiguousError,
  FcasOrphanedError,
  FcasUnsupportedError,
  parseFcas,
  projectFcidToFcas,
  resolveFcasToFcid,
} from "../../core/lab03Service.js";

const STATUS_BY_CODE_035: Record<Lab035ErrorCode, number> = {
  NOT_FOUND: 404,
  INVALID_OPERATION: 422,
  CONFLICT: 409,
  CYCLE: 409,
  NOT_A_PERMUTATION: 422,
  TARGET_NOT_ACTIVE: 409,
};

function sendStructureError(reply: FastifyReply, error: unknown) {
  if (error instanceof Lab035Error) {
    return reply.code(STATUS_BY_CODE_035[error.code]).send({ error: error.message, code: error.code, details: error.details });
  }
  throw error;
}

/** Resolution failures shared by `resolve` and `references`. Anything not listed is "not found". */
function sendResolutionError(reply: FastifyReply, error: unknown) {
  if (error instanceof Error && error.message === "FCAS_INVALID") {
    return reply.code(400).send({ error: "Invalid FCAS syntax" });
  }
  if (error instanceof FcasAmbiguousError) {
    return reply.code(409).send({
      error: "FCAS target was split; resolution is ambiguous",
      details: { originalFcid: error.originalFcid, candidates: error.candidates },
    });
  }
  if (error instanceof FcasNameAmbiguousError) {
    return reply.code(409).send({
      error: `The name "${error.name}" matches more than one artifact`,
      code: "AMBIGUOUS_NAME",
      details: { name: error.name, candidates: error.candidates },
    });
  }
  if (error instanceof FcasOrphanedError) {
    return reply.code(409).send({
      error: "FCAS target was superseded and has no active successor",
      code: "ORPHANED",
      details: { originalFcid: error.originalFcid, cause: error.cause, candidates: error.candidates },
    });
  }
  if (error instanceof FcasUnsupportedError) {
    return reply.code(422).send({
      error: `The ${error.syntax} syntax is part of FCAS but is not resolved by this POC`,
      code: "UNSUPPORTED_SYNTAX",
      details: { syntax: error.syntax },
    });
  }
  return reply.code(404).send({ error: "FCAS target not found" });
}

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
      return sendResolutionError(reply, error);
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
      return sendResolutionError(reply, error);
    }
  });

  // Lab 03.5: structural operations and the state of a reference (ADR-024).
  app.post("/v1/lab03/rename", async (request, reply) => {
    const parsed = renameSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    try {
      return { data: await renameResource(parsed.data) };
    } catch (error) {
      return sendStructureError(reply, error);
    }
  });

  app.post("/v1/lab03/move", async (request, reply) => {
    const parsed = moveSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    try {
      return { data: await moveArtifact(parsed.data) };
    } catch (error) {
      return sendStructureError(reply, error);
    }
  });

  app.post("/v1/lab03/reorder", async (request, reply) => {
    const parsed = reorderSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    try {
      return { data: await reorderChildren(parsed.data) };
    } catch (error) {
      return sendStructureError(reply, error);
    }
  });

  app.get<{ Params: { referenceId: string } }>("/v1/lab03/references/:referenceId", async (request, reply) => {
    try {
      return { data: await referenceStatus(request.params.referenceId) };
    } catch (error) {
      return sendStructureError(reply, error);
    }
  });

  app.post<{ Params: { referenceId: string } }>("/v1/lab03/references/:referenceId/refresh", async (request, reply) => {
    try {
      return { data: await refreshReference(request.params.referenceId) };
    } catch (error) {
      return sendStructureError(reply, error);
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
