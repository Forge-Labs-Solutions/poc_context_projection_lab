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
  it("should serve UI root", async () => {
    const response = await app.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("Context Projection Lab UI");
  });

  it("should serve UI static asset", async () => {
    const response = await app.inject({ method: "GET", url: "/ui/styles.css" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/css");
    expect(response.body).toContain(":root");
  });

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
    const explorerBody = explorer.json() as { data: { parent: string[] } };
    expect(explorerBody.data.parent).toContain("WS_MAIN");
  });

  it("should reject explicit workspace as parent in document import", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/lab01/import/document",
      payload: {
        resourceKey: "docs/invalid-parent.md",
        title: "Invalid Parent",
        text: "# Intro\nText",
        parentFcid: "WS_MAIN",
      },
    });
    expect(response.statusCode).toBe(409);
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

  it("should project paragraph sentences as a single markdown paragraph", async () => {
    const imported = await app.inject({
      method: "POST",
      url: "/v1/lab01/import/document",
      payload: {
        resourceKey: "docs/paragraph-doc.md",
        title: "Paragraph Doc",
        text: "# Intro\nFirst sentence. Second sentence. Third sentence.",
      },
    });
    const rootFcid = (imported.json() as { data: { rootFcid: string } }).data.rootFcid;

    const projected = await app.inject({
      method: "POST",
      url: "/v1/lab02/project",
      payload: { artifactFcid: rootFcid, targetFormat: "markdown" },
    });

    expect(projected.statusCode).toBe(200);
    const body = projected.json() as { data: { content: string } };
    expect(body.data.content).toContain("First sentence. Second sentence. Third sentence.");
    expect(body.data.content).not.toContain("First sentence.\n\nSecond sentence.");
  });

  it("should preserve nested sections as SS children and project heading levels", async () => {
    const imported = await app.inject({
      method: "POST",
      url: "/v1/lab01/import/document",
      payload: {
        resourceKey: "docs/nested-sections.md",
        title: "Nested Sections",
        text: "# Parent\nParent paragraph.\n\n## Child\nChild paragraph.",
      },
    });
    const rootFcid = (imported.json() as { data: { rootFcid: string } }).data.rootFcid;

    const explorer = await app.inject({
      method: "GET",
      url: `/v1/lab01/explorer/artifacts/${rootFcid}`,
    });
    const explorerBody = explorer.json() as { data: { children: string[] } };
    expect(explorerBody.data.children.length).toBe(1);

    const parentSectionFcid = explorerBody.data.children[0];
    const parentSection = await app.inject({
      method: "GET",
      url: `/v1/lab01/explorer/artifacts/${parentSectionFcid}`,
    });
    const parentBody = parentSection.json() as { data: { children: string[] } };
    expect(parentBody.data.children.length).toBeGreaterThanOrEqual(2);

    const nestedSectionFcid = parentBody.data.children.find((childFcid) => childFcid.startsWith("SS_"));
    expect(nestedSectionFcid).toBeTruthy();

    const projected = await app.inject({
      method: "POST",
      url: "/v1/lab02/project",
      payload: { artifactFcid: rootFcid, targetFormat: "markdown" },
    });
    const projectedBody = projected.json() as { data: { content: string } };
    expect(projectedBody.data.content).toContain("# Parent");
    expect(projectedBody.data.content).toContain("## Child");
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

  it("should parse and resolve document FCAS", async () => {
    const imported = await app.inject({
      method: "POST",
      url: "/v1/lab01/import/document",
      payload: {
        resourceKey: "architecture.md",
        title: "Architecture",
        text: "# Introduction\nFCAS is human readable.",
      },
    });
    const importBody = imported.json() as { data: { rootFcid: string } };

    const parsed = await app.inject({
      method: "POST",
      url: "/v1/lab03/parse",
      payload: { fcas: "[[architecture.md#Introduction]]" },
    });
    expect(parsed.statusCode).toBe(200);

    const resolved = await app.inject({
      method: "POST",
      url: "/v1/lab03/resolve",
      payload: { fcas: "[[architecture.md]]" },
    });
    expect(resolved.statusCode).toBe(200);
    const resolvedBody = resolved.json() as { data: { targetFcid: string } };
    expect(resolvedBody.data.targetFcid).toBe(importBody.data.rootFcid);
  });

  it("should resolve nested section FCAS to child section", async () => {
    const imported = await app.inject({
      method: "POST",
      url: "/v1/lab01/import/document",
      payload: {
        resourceKey: "nested-resolution.md",
        title: "Nested Resolution",
        text: "# Parent\nParent paragraph.\n\n## Child\nChild paragraph.",
      },
    });
    expect(imported.statusCode).toBe(200);

    const resolved = await app.inject({
      method: "POST",
      url: "/v1/lab03/resolve",
      payload: { fcas: "[[nested-resolution.md#Child]]" },
    });
    expect(resolved.statusCode).toBe(200);
    const resolvedBody = resolved.json() as { data: { targetFcid: string } };
    expect(resolvedBody.data.targetFcid).toMatch(/^SS_[A-Z0-9]{6}$/);
  });

  it("should resolve chat message FCAS and create reference artifact", async () => {
    const chat = await app.inject({
      method: "POST",
      url: "/v1/lab01/chat/create",
      payload: { resourceKey: "::retrieval-chat-03", title: "Retrieval Chat 03" },
    });
    const chatBody = chat.json() as { data: { chatFcid: string } };

    await app.inject({
      method: "POST",
      url: `/v1/lab01/chat/${chatBody.data.chatFcid}/messages`,
      payload: { role: "user", text: "First message." },
    });

    const resolved = await app.inject({
      method: "POST",
      url: "/v1/lab03/resolve",
      payload: { fcas: "[[::retrieval-chat-03<1>]]" },
    });
    expect(resolved.statusCode).toBe(200);
    const resolvedBody = resolved.json() as { data: { targetFcid: string } };
    expect(resolvedBody.data.targetFcid).toMatch(/^MS_[A-Z0-9]{6}$/);

    const reference = await app.inject({
      method: "POST",
      url: "/v1/lab03/references",
      payload: { sourceFcid: chatBody.data.chatFcid, fcas: "[[::retrieval-chat-03<1>]]" },
    });
    expect(reference.statusCode).toBe(200);
  });

  it("should project FCID back to FCAS", async () => {
    const imported = await app.inject({
      method: "POST",
      url: "/v1/lab01/import/document",
      payload: {
        resourceKey: "core-architecture.md",
        title: "Core Architecture",
        text: "# Introduction\nPersistent identity.",
      },
    });
    const rootFcid = (imported.json() as { data: { rootFcid: string } }).data.rootFcid;

    const projected = await app.inject({
      method: "POST",
      url: "/v1/lab03/project-fcas",
      payload: { targetFcid: rootFcid },
    });
    expect(projected.statusCode).toBe(200);
    const body = projected.json() as { data: { fcas: string } };
    expect(body.data.fcas).toBe("[[core-architecture.md]]");
  });

  it("should import directory with documents and default parent workspace", async () => {
    const resp = await app.inject({
      method: "POST",
      url: "/v1/lab01/import/directory",
      payload: {
        title: "Architecture Dir",
        documents: [
          {
            resourceKey: "docs/dir-a.md",
            title: "Doc A",
            text: "# Intro\nA sentence.",
          },
          {
            resourceKey: "docs/dir-b.md",
            title: "Doc B",
            text: "# Intro\nB sentence.",
          },
        ],
      },
    });
    expect(resp.statusCode).toBe(200);
    const body = resp.json() as {
      data: {
        directoryFcid: string;
        parentFcid: string;
        documents: Array<{ rootFcid: string }>;
      };
    };
    expect(body.data.directoryFcid).toMatch(/^DR_[A-Z0-9]{6}$/);
    expect(body.data.parentFcid).toBe("WS_MAIN");
    expect(body.data.documents.length).toBe(2);

    const dirExplorer = await app.inject({
      method: "GET",
      url: `/v1/lab01/explorer/artifacts/${body.data.directoryFcid}`,
    });
    expect(dirExplorer.statusCode).toBe(200);
    const dirBody = dirExplorer.json() as { data: { children: string[] } };
    expect(dirBody.data.children.length).toBeGreaterThanOrEqual(2);
  });

  describe("text before the first heading", () => {
    async function post(url: string, payload: Record<string, unknown>) {
      const response = await app.inject({ method: "POST", url, payload });
      return { status: response.statusCode, body: response.json() as Record<string, any> };
    }

    async function importDoc(resourceKey: string, text: string): Promise<string> {
      const { body } = await post("/v1/lab01/import/document", { resourceKey, title: resourceKey, text });
      return body.data.rootFcid as string;
    }

    async function project(artifactFcid: string, targetFormat: "markdown" | "json" = "markdown") {
      const { body } = await post("/v1/lab02/project", { artifactFcid, targetFormat });
      return body.data as { content?: string; structured?: Record<string, unknown[]> };
    }

    it("keeps a preface, before the sections, in the document projection", async () => {
      const dc = await importDoc("preface-one.md", "Preface before any heading.\n\n# Heading\n\nBody text.");
      const content = (await project(dc)).content as string;
      expect(content).toContain("Preface before any heading.");
      expect(content).toContain("# Heading");
      expect(content).toContain("Body text.");
      expect(content.indexOf("Preface before any heading.")).toBeLessThan(content.indexOf("# Heading"));

      const structured = (await project(dc, "json")).structured as Record<string, unknown[]>;
      expect(structured.paragraphs).toHaveLength(1);
      expect(structured.sections).toHaveLength(1);
    });

    it("keeps several preface paragraphs in order", async () => {
      const dc = await importDoc("preface-many.md", "First preface.\n\nSecond preface.\n\n# H\n\nBody.");
      const content = (await project(dc)).content as string;
      expect(content.indexOf("First preface.")).toBeGreaterThan(-1);
      expect(content.indexOf("First preface.")).toBeLessThan(content.indexOf("Second preface."));
      expect(content.indexOf("Second preface.")).toBeLessThan(content.indexOf("# H"));
    });

    it("keeps a preface in a chat message", async () => {
      const chat = await post("/v1/lab01/chat/create", { resourceKey: "::preface-chat", title: "Preface chat" });
      const chatFcid = chat.body.data.chatFcid as string;
      const message = await post(`/v1/lab01/chat/${chatFcid}/messages`, { role: "assistant", text: "Plan first:\n\n# Step 1\n\nDo it." });
      const messageFcid = message.body.data.messageFcid as string;

      const content = (await project(chatFcid)).content as string;
      expect(content).toContain("Plan first:");
      expect(content).toContain("# Step 1");
      expect(content).toContain("Do it.");
      expect(content.indexOf("Plan first:")).toBeLessThan(content.indexOf("# Step 1"));

      const structured = (await project(messageFcid, "json")).structured as Record<string, unknown[]>;
      expect(structured.paragraphs).toHaveLength(1);
      expect(structured.sections).toHaveLength(1);
    });

    it("counts the preface as the first child in a Lab 05 window", async () => {
      const dc = await importDoc("preface-window.md", "Preface before any heading.\n\n# Heading\n\nBody text.");
      const first = await post("/v1/lab05/assemble", { target: dc, range: { from: 1, to: 1 }, expand: false });
      expect(first.body.data.content).toBe("Preface before any heading.");
      expect(first.body.data.selection).toMatchObject({ from: 1, to: 1, total: 2 });

      const second = await post("/v1/lab05/assemble", { target: dc, range: { from: 2, to: 2 }, expand: false });
      expect(second.body.data.content).toBe("# Heading\n\nBody text.");
    });
  });
});
