import Fastify, { type FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { artifactEdges, artifacts } from "../db/schema.js";
import { resetAndSeed } from "../seeds/seed.js";

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/v1/artifacts", async () => {
    const rows = await db.select().from(artifacts);
    return { data: rows };
  });

  app.get<{ Params: { fcid: string } }>("/v1/artifacts/:fcid", async (request, reply) => {
    const { fcid } = request.params;
    const rows = await db.select().from(artifacts).where(eq(artifacts.fcid, fcid)).limit(1);

    if (rows.length === 0) {
      return reply.code(404).send({ error: "Artifact not found" });
    }

    return { data: rows[0] };
  });

  app.get("/v1/graph", async () => {
    const [nodes, edges] = await Promise.all([
      db.select().from(artifacts),
      db.select().from(artifactEdges),
    ]);

    return { data: { nodes, edges } };
  });

  app.post("/v1/seeds/reset", async () => {
    await resetAndSeed();
    return { status: "ok", message: "Seed reset completed." };
  });

  return app;
}
