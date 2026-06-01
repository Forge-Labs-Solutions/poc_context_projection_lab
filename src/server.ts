import "dotenv/config";
import { buildApp } from "./api/app.js";

const app = buildApp();
const port = Number(process.env.PORT ?? "3000");

const signalHandler = async (): Promise<void> => {
  await app.close();
  process.exit(0);
};

process.on("SIGINT", signalHandler);
process.on("SIGTERM", signalHandler);

app.listen({ port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
