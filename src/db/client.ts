import "dotenv/config";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

const dbPath = process.env.DATABASE_URL ?? "./data/forgeos.db";
const absolute = resolve(dbPath);
mkdirSync(dirname(absolute), { recursive: true });

const sqlite = new Database(absolute);
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite);
export const sqliteClient = sqlite;
