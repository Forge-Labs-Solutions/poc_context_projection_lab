import Fastify, { type FastifyInstance } from "fastify";
import { registerBaseRoutes } from "./routes/baseRoutes.js";
import { registerLab01Routes } from "./routes/lab01Routes.js";
import { registerLab02Routes } from "./routes/lab02Routes.js";
import { registerLab03Routes } from "./routes/lab03Routes.js";
import { registerLab04Routes } from "./routes/lab04Routes.js";
import { registerLab05Routes } from "./routes/lab05Routes.js";
import { registerUiRoutes } from "./routes/uiRoutes.js";

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });
  registerBaseRoutes(app);
  registerLab01Routes(app);
  registerLab02Routes(app);
  registerLab03Routes(app);
  registerLab04Routes(app);
  registerLab05Routes(app);
  registerUiRoutes(app);

  return app;
}
