import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./client.js";

mkdirSync(resolve("./drizzle"), { recursive: true });

migrate(db, { migrationsFolder: "./drizzle" });

console.log("Migrations applied.");
