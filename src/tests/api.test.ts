import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../api/app.js";
import { resetAndSeed } from "../seeds/seed.js";

const app = buildApp();

beforeAll(async () => {
  await resetAndSeed();
});

afterAll(async () => {
  await app.close();
});

describe("bootstrap API", () => {
  it("health check should return ok", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("should list artifacts", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/artifacts" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: Array<{ fcid: string }> };
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.some((a) => a.fcid === "WS_MAIN")).toBe(true);
  });

  it("should return graph with nodes and edges", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/graph" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      data: { nodes: unknown[]; edges: unknown[] };
    };
    expect(body.data.nodes.length).toBeGreaterThan(0);
    expect(body.data.edges.length).toBeGreaterThan(0);
  });
});
