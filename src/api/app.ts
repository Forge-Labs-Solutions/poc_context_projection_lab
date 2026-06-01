import Fastify, { type FastifyInstance } from "fastify";
import { registerBaseRoutes } from "./routes/baseRoutes.js";
import { registerLab01Routes } from "./routes/lab01Routes.js";
import { registerLab02Routes } from "./routes/lab02Routes.js";

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });
  registerBaseRoutes(app);
  registerLab01Routes(app);
  registerLab02Routes(app);

  return app;
}
