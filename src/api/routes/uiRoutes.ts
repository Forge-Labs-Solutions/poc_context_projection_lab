import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";

const UI_DIR = path.join(process.cwd(), "src", "ui");

const MIME_BY_EXT: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
};

async function sendUiFile(reply: { type: (mime: string) => unknown; send: (payload: string) => unknown }, fileName: string): Promise<void> {
  const filePath = path.join(UI_DIR, fileName);
  const ext = path.extname(fileName);
  const mime = MIME_BY_EXT[ext] ?? "text/plain; charset=utf-8";
  const content = await readFile(filePath, "utf8");
  reply.type(mime);
  reply.send(content);
}

export function registerUiRoutes(app: FastifyInstance): void {
  app.get("/", async (_request, reply) => {
    try {
      await sendUiFile(reply, "index.html");
    } catch {
      reply.code(404).send({ error: "UI not found" });
    }
  });

  app.get<{ Params: { file: string } }>("/ui/:file", async (request, reply) => {
    const file = request.params.file;
    if (!/^[a-zA-Z0-9_.-]+$/.test(file)) {
      return reply.code(400).send({ error: "Invalid file name" });
    }

    try {
      await sendUiFile(reply, file);
    } catch {
      return reply.code(404).send({ error: "UI asset not found" });
    }
  });
}
