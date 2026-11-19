import type { FastifyInstance } from "fastify";
import {
  addChatMessageSchema,
  createChatSchema,
  importChatSchema,
  importDirectorySchema,
  importDocumentSchema,
  removeProjectionSchema,
} from "../../core/lab01Schemas.js";
import {
  addMessageToChat,
  artifactExplorer,
  artifactExplorerTree,
  createChat,
  importDirectory,
  importDocument,
  removeProjection,
  validateProjection,
} from "../../core/lab01Service.js";
import { FcidConflictError, importChat } from "../../core/lab015Service.js";

export function registerLab01Routes(app: FastifyInstance): void {
  app.post("/v1/lab01/import/document", async (request, reply) => {
    const parsed = importDocumentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      const result = await importDocument(parsed.data);
      return { data: result };
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_PARENT") {
        return reply.code(409).send({ error: "Parent must be PJ or DR (or omit for workspace)" });
      }
      if (error instanceof Error && error.message === "WORKSPACE_NOT_FOUND") {
        return reply.code(404).send({ error: "Workspace artifact not found" });
      }
      return reply.code(500).send({ error: "Document import failed" });
    }
  });

  app.post("/v1/lab01/import/directory", async (request, reply) => {
    const parsed = importDirectorySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      const result = await importDirectory(parsed.data);
      return { data: result };
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_PARENT") {
        return reply.code(409).send({ error: "Parent must be PJ or DR (or omit for workspace)" });
      }
      if (error instanceof Error && error.message === "WORKSPACE_NOT_FOUND") {
        return reply.code(404).send({ error: "Workspace artifact not found" });
      }
      return reply.code(500).send({ error: "Directory import failed" });
    }
  });

  app.post("/v1/lab01/chat/create", async (request, reply) => {
    const parsed = createChatSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const result = await createChat(parsed.data.resourceKey, parsed.data.title);
    return { data: result };
  });

  // Lab 01.5: creates the chat or brings an existing one to this conversation (idempotent).
  app.post("/v1/lab01/chat/import", async (request, reply) => {
    const parsed = importChatSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      const result = importChat(parsed.data);
      return {
        data: {
          chatFcid: result.chatFcid,
          projectionId: result.projectionId,
          messageFcids: result.messageFcids,
          reimport: result.created ? null : result.summary,
        },
      };
    } catch (error) {
      if (error instanceof FcidConflictError) {
        return reply.code(409).send({ error: error.reason, code: "FCID_CONFLICT", details: { fcid: error.fcid } });
      }
      if (error instanceof Error && error.message === "MIXED_MESSAGE_IDENTITY") {
        return reply.code(400).send({ error: "Give an fcid to every message or to none" });
      }
      return reply.code(500).send({ error: "Chat import failed" });
    }
  });

  app.post<{ Params: { chatFcid: string } }>("/v1/lab01/chat/:chatFcid/messages", async (request, reply) => {
    const parsed = addChatMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      const result = await addMessageToChat(request.params.chatFcid, parsed.data);
      return { data: result };
    } catch {
      return reply.code(404).send({ error: "Chat not found" });
    }
  });

  app.post("/v1/lab01/projection/remove", async (request, reply) => {
    const parsed = removeProjectionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const removed = await removeProjection(parsed.data.projectionId);
    if (!removed) {
      return reply.code(404).send({ error: "Projection not found" });
    }
    return { status: "ok" };
  });

  app.get("/v1/lab01/explorer/artifacts", async () => ({ data: await artifactExplorer() }));
  app.get("/v1/lab01/explorer/tree", async () => ({ data: await artifactExplorerTree() }));
  app.get<{ Params: { fcid: string } }>("/v1/lab01/explorer/artifacts/:fcid", async (request, reply) => {
    const data = await artifactExplorer(request.params.fcid);
    if (!data) return reply.code(404).send({ error: "Artifact not found" });
    return { data };
  });

  app.get<{ Params: { projectionId: string } }>("/v1/lab01/validation/:projectionId", async (request, reply) => {
    const data = await validateProjection(request.params.projectionId);
    if (!data) return reply.code(404).send({ error: "Projection not found" });
    return { data };
  });
}
