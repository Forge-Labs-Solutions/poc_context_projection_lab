import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodType } from "zod";
import {
  classifySchema,
  editSchema,
  mergeSchema,
  regenerateSchema,
  semanticChangeSchema,
  splitSchema,
} from "../../core/lab04Schemas.js";
import {
  classifyArtifactChange,
  editArtifact,
  getCurrentFcids,
  getLineage,
  Lab04Error,
  type Lab04ErrorCode,
  mergeArtifacts,
  regenerateMessage,
  resolveReferenceContinuity,
  semanticChange,
  splitArtifact,
} from "../../core/lab04Service.js";

const STATUS_BY_CODE: Record<Lab04ErrorCode, number> = {
  NOT_FOUND: 404,
  SUPERSEDED: 409,
  INVALID_OPERATION: 422,
  NO_CHANGE: 422,
  CONTENT_CHANGED: 422,
  NO_PARENT: 422,
  DIFFERENT_PARENTS: 422,
  NOT_ADJACENT: 422,
};

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof Lab04Error) {
    return reply.code(STATUS_BY_CODE[error.code]).send({ error: error.message, code: error.code, details: error.details });
  }
  throw error;
}

function post<T>(app: FastifyInstance, url: string, schema: ZodType<T>, handler: (body: T) => unknown | Promise<unknown>): void {
  app.post(url, async (request, reply) => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    try {
      return { data: await handler(parsed.data) };
    } catch (error) {
      return sendError(reply, error);
    }
  });
}

export function registerLab04Routes(app: FastifyInstance): void {
  post(app, "/v1/lab04/edit", editSchema, editArtifact);
  post(app, "/v1/lab04/semantic-change", semanticChangeSchema, semanticChange);
  post(app, "/v1/lab04/classify", classifySchema, (body) => classifyArtifactChange(body.fcid, body.text));
  post(app, "/v1/lab04/split", splitSchema, splitArtifact);
  post(app, "/v1/lab04/merge", mergeSchema, mergeArtifacts);
  post(app, "/v1/lab04/regenerate", regenerateSchema, regenerateMessage);

  app.get<{ Params: { fcid: string } }>("/v1/lab04/lineage/:fcid", async (request, reply) => {
    try {
      return { data: getLineage(request.params.fcid) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get<{ Params: { fcid: string } }>("/v1/lab04/current/:fcid", async (request, reply) => {
    try {
      return { data: getCurrentFcids(request.params.fcid) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get<{ Params: { referenceId: string } }>("/v1/lab04/references/:referenceId", async (request, reply) => {
    try {
      return { data: resolveReferenceContinuity(request.params.referenceId) };
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
