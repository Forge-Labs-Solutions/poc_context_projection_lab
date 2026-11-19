import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodType } from "zod";
import { assembleSchema, expandSchema } from "../../core/lab05Schemas.js";
import { assemble, expandReferences, Lab05Error, type Lab05ErrorCode } from "../../core/lab05Service.js";

const STATUS_BY_CODE: Record<Lab05ErrorCode, number> = {
  INVALID_TARGET: 400,
  NOT_FOUND: 404,
  UNSUPPORTED_SCOPE: 409,
  AMBIGUOUS: 409,
  ORPHANED: 409,
  INVALID_RANGE: 422,
  NO_CHILDREN: 422,
  ROLES_NOT_APPLICABLE: 422,
};

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof Lab05Error) {
    return reply.code(STATUS_BY_CODE[error.code]).send({ error: error.message, code: error.code, details: error.details });
  }
  throw error;
}

function post<T>(app: FastifyInstance, url: string, schema: ZodType<T>, handler: (body: T) => Promise<unknown>): void {
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

export function registerLab05Routes(app: FastifyInstance): void {
  post(app, "/v1/lab05/assemble", assembleSchema, assemble);
  post(app, "/v1/lab05/expand", expandSchema, expandReferences);
}
