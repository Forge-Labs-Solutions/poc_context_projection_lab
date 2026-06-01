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

  it("should import document with alphanumeric FCID", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/lab01/import/document",
      payload: {
        resourceKey: "docs/architecture.md",
        title: "Architecture",
        text: "# Intro\nFCID is persistent.",
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: { rootFcid: string; projectionId: string } };
    expect(body.data.rootFcid).toMatch(/^DC_[A-Z0-9]{6}$/);

    const explorer = await app.inject({ method: "GET", url: `/v1/lab01/explorer/artifacts/${body.data.rootFcid}` });
    expect(explorer.statusCode).toBe(200);
  });

  it("should create chat and add message", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/lab01/chat/create",
      payload: { resourceKey: "::retrieval-chat", title: "Retrieval Chat" },
    });
    expect(createResponse.statusCode).toBe(200);
    const createBody = createResponse.json() as { data: { chatFcid: string; projectionId: string } };
    expect(createBody.data.chatFcid).toMatch(/^CH_[A-Z0-9]{6}$/);

    const addMessage = await app.inject({
      method: "POST",
      url: `/v1/lab01/chat/${createBody.data.chatFcid}/messages`,
      payload: { role: "user", text: "Hello world" },
    });
    expect(addMessage.statusCode).toBe(200);
    const addBody = addMessage.json() as { data: { messageFcid: string } };
    expect(addBody.data.messageFcid).toMatch(/^MS_[A-Z0-9]{6}$/);

    const validation = await app.inject({
      method: "GET",
      url: `/v1/lab01/validation/${createBody.data.projectionId}`,
    });
    expect(validation.statusCode).toBe(200);
  });

  it("should parse markdown sections from chat message text", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/lab01/chat/create",
      payload: { resourceKey: "::md-chat", title: "Markdown Chat" },
    });
    const createBody = createResponse.json() as { data: { chatFcid: string } };

    const addMessage = await app.inject({
      method: "POST",
      url: `/v1/lab01/chat/${createBody.data.chatFcid}/messages`,
      payload: {
        role: "assistant",
        text: "# Summary\nFirst sentence. Second sentence.\n\n## Details\nMore context here.",
      },
    });
    expect(addMessage.statusCode).toBe(200);
  });

  it("should remove projection and keep artifact", async () => {
    const imported = await app.inject({
      method: "POST",
      url: "/v1/lab01/import/document",
      payload: {
        resourceKey: "docs/to-remove.md",
        title: "To Remove",
        text: "# S1\nText",
      },
    });
    const importBody = imported.json() as { data: { rootFcid: string; projectionId: string } };
    const removeResp = await app.inject({
      method: "POST",
      url: "/v1/lab01/projection/remove",
      payload: { projectionId: importBody.data.projectionId },
    });
    expect(removeResp.statusCode).toBe(200);

    const artifactStillThere = await app.inject({
      method: "GET",
      url: `/v1/lab01/explorer/artifacts/${importBody.data.rootFcid}`,
    });
    expect(artifactStillThere.statusCode).toBe(200);
  });

  it("should project document in default markdown format", async () => {
    const imported = await app.inject({
      method: "POST",
      url: "/v1/lab01/import/document",
      payload: {
        resourceKey: "docs/project-doc.md",
        title: "Projection Doc",
        text: "# Intro\nProjection content sentence.",
      },
    });
    const importBody = imported.json() as { data: { rootFcid: string } };

    const projected = await app.inject({
      method: "POST",
      url: "/v1/lab02/project",
      payload: { artifactFcid: importBody.data.rootFcid },
    });
    expect(projected.statusCode).toBe(200);
    const body = projected.json() as { data: { scope: string; targetFormat: string; content: string } };
    expect(body.data.scope).toBe("DC");
    expect(body.data.targetFormat).toBe("markdown");
    expect(body.data.content.length).toBeGreaterThan(0);
  });

  it("should project same artifact in markdown text and json", async () => {
    const imported = await app.inject({
      method: "POST",
      url: "/v1/lab01/import/document",
      payload: {
        resourceKey: "docs/formats-doc.md",
        title: "Formats Doc",
        text: "# Intro\nA. B.",
      },
    });
    const importBody = imported.json() as { data: { rootFcid: string } };

    const markdownResp = await app.inject({
      method: "POST",
      url: "/v1/lab02/project",
      payload: { artifactFcid: importBody.data.rootFcid, targetFormat: "markdown" },
    });
    const textResp = await app.inject({
      method: "POST",
      url: "/v1/lab02/project",
      payload: { artifactFcid: importBody.data.rootFcid, targetFormat: "text" },
    });
    const jsonResp = await app.inject({
      method: "POST",
      url: "/v1/lab02/project",
      payload: { artifactFcid: importBody.data.rootFcid, targetFormat: "json" },
    });

    expect(markdownResp.statusCode).toBe(200);
    expect(textResp.statusCode).toBe(200);
    expect(jsonResp.statusCode).toBe(200);

    const jsonBody = jsonResp.json() as { data: { structured: unknown } };
    expect(jsonBody.data.structured).toBeTruthy();
  });

  it("should return 404 for unknown artifact projection", async () => {
    const projected = await app.inject({
      method: "POST",
      url: "/v1/lab02/project",
      payload: { artifactFcid: "DC_UNKNOWN" },
    });
    expect(projected.statusCode).toBe(404);
  });

  it("should return 409 for unsupported artifact type", async () => {
    const projected = await app.inject({
      method: "POST",
      url: "/v1/lab02/project",
      payload: { artifactFcid: "WS_MAIN" },
    });
    expect(projected.statusCode).toBe(409);
  });
});
