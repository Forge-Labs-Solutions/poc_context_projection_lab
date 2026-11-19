import type { FastifyInstance, FastifyReply } from "fastify";
import { synthesizeSchema } from "../../core/lab06Schemas.js";
import { Lab06Error, type Lab06ErrorCode, synthesize } from "../../core/lab06Service.js";

const STATUS_BY_CODE: Record<Lab06ErrorCode, number> = {
  ITEM_NOT_FOUND: 404,
  SCOPE_NOT_FOUND: 404,
  ITEM_AMBIGUOUS: 409,
  SCOPE_AMBIGUOUS: 409,
  INVALID_ITEM: 422,
  ITEM_TYPE_NOT_ALLOWED: 422,
  INVALID_SCOPE: 422,
  EMPTY_POOL: 422,
};

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof Lab06Error) {
    return reply.code(STATUS_BY_CODE[error.code]).send({ error: error.message, code: error.code, details: error.details });
  }
  throw error;
}

export function registerLab06Routes(app: FastifyInstance): void {
  app.post("/v1/lab06/synthesize", async (request, reply) => {
    const parsed = synthesizeSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    try {
      return { data: await synthesize(parsed.data) };
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
