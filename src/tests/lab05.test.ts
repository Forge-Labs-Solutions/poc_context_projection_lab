import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../api/app.js";
import { sqliteClient } from "../db/client.js";
import { resetAndSeed } from "../seeds/seed.js";

// Lab 05 — Context Assembly. Scenarios C01–C21 from docs/lab 05.md.

const app = buildApp();

beforeAll(async () => {
  await resetAndSeed();
});

afterAll(async () => {
  await app.close();
});

let counter = 0;
const unique = (prefix: string): string => {
  counter += 1;
  return `${prefix}-${counter}`;
};

function childrenOf(fcid: string): string[] {
  return (
    sqliteClient
      .prepare("select child_fcid from artifact_edges where parent_fcid = ? and relation_type = 'contains' order by order_index")
      .all(fcid) as Array<{ child_fcid: string }>
  ).map((r) => r.child_fcid);
}

async function post(url: string, payload: unknown) {
  const response = await app.inject({ method: "POST", url, payload: payload as Record<string, unknown> });
  return { status: response.statusCode, body: response.json() as Record<string, any> };
}

async function importDoc(text: string, name = unique("doc")) {
  const resourceKey = `${name}.md`;
  const { body } = await post("/v1/lab01/import/document", { resourceKey, title: name, text });
  return { resourceKey, fcas: `[[${resourceKey}]]`, dc: body.data.rootFcid as string };
}

/** DC -> SS -> PG -> SN for a document with a single heading and a single sentence. */
function firstSn(dc: string): string {
  let current = dc;
  for (;;) {
    const next = childrenOf(current)[0];
    if (!next) return current;
    current = next;
    if (current.startsWith("SN_")) return current;
  }
}

async function createChat(messages: Array<{ role: string; text: string }>) {
  const resourceKey = `::${unique("asm-chat")}`;
  const chat = await post("/v1/lab01/chat/create", { resourceKey, title: resourceKey });
  const chatFcid = chat.body.data.chatFcid as string;
  for (const message of messages) await post(`/v1/lab01/chat/${chatFcid}/messages`, message);
  return { resourceKey, chatFcid, fcas: `[[${resourceKey}]]` };
}

async function project(fcid: string, targetFormat: "markdown" | "text" = "markdown"): Promise<string> {
  const { body } = await post("/v1/lab02/project", { artifactFcid: fcid, targetFormat });
  return body.data.content as string;
}

const CHAT_MESSAGES = [
  { role: "user", text: "Msg one." },
  { role: "assistant", text: "Msg two." },
  { role: "user", text: "Msg three." },
  { role: "assistant", text: "Msg four." },
];

describe("Lab 05 — Context Assembly", () => {
  it("C01: document assembly without selection or expansion equals the projection", async () => {
    const doc = await importDoc("# Intro\n\nFirst. Second.\n\n## Child\n\nNested.");
    const projection = await project(doc.dc);
    const textProjection = await project(doc.dc, "text");

    const plain = await post("/v1/lab05/assemble", { target: doc.fcas, expand: false });
    expect(plain.status).toBe(200);
    expect(plain.body.data.content).toBe(projection);
    expect(plain.body.data.selection).toBeNull();
    expect(plain.body.data.manifest).toEqual([{ fcid: doc.dc, type: "DC", role: "root", depth: 0 }]);

    const expanded = await post("/v1/lab05/assemble", { target: doc.fcas });
    expect(expanded.body.data.content).toBe(projection);
    expect(expanded.body.data.stats).toEqual({ expanded: 0, warnings: 0 });

    const text = await post("/v1/lab05/assemble", { target: doc.dc, expand: false, format: "text" });
    expect(text.body.data.content).toBe(textProjection);
  });

  it("C02: document without headings keeps every paragraph (ADR-010)", async () => {
    const doc = await importDoc("First paragraph here.\n\nSecond paragraph here.");
    expect(childrenOf(doc.dc).every((f) => f.startsWith("PG_"))).toBe(true);

    const projection = await project(doc.dc);
    expect(projection).toContain("First paragraph here.");
    expect(projection).toContain("Second paragraph here.");

    const assembled = await post("/v1/lab05/assemble", { target: doc.fcas, expand: false });
    expect(assembled.body.data.content).toBe(projection);

    const json = await post("/v1/lab02/project", { artifactFcid: doc.dc, targetFormat: "json" });
    expect(json.body.data.structured.paragraphs).toHaveLength(2);
    expect(json.body.data.structured.sections).toEqual([]);
  });

  it("C03: nested sections keep hierarchy and order", async () => {
    const doc = await importDoc("# Parent\n\nParent text.\n\n## Child\n\nChild text.\n\n### Grandchild\n\nDeep text.");
    const assembled = await post("/v1/lab05/assemble", { target: doc.fcas });
    const content = assembled.body.data.content as string;
    expect(content.indexOf("# Parent")).toBeLessThan(content.indexOf("## Child"));
    expect(content.indexOf("## Child")).toBeLessThan(content.indexOf("### Grandchild"));
    expect(content.indexOf("Child text.")).toBeLessThan(content.indexOf("### Grandchild"));
    expect(content).toBe(await project(doc.dc));
  });

  it("C04: chat assembly without selection or expansion equals the projection", async () => {
    const chat = await createChat(CHAT_MESSAGES);
    const assembled = await post("/v1/lab05/assemble", { target: chat.fcas, expand: false });
    expect(assembled.status).toBe(200);
    expect(assembled.body.data.content).toBe(await project(chat.chatFcid));
    expect(assembled.body.data.target.type).toBe("CH");
    const content = assembled.body.data.content as string;
    expect(content.indexOf("Msg one.")).toBeLessThan(content.indexOf("Msg four."));
  });

  it("C05: a single section is assembled through its FCAS", async () => {
    const doc = await importDoc("# Top\n\nIntro text.\n\n## Child\n\nNested text.");
    const assembled = await post("/v1/lab05/assemble", { target: `[[${doc.resourceKey}#Child]]` });
    expect(assembled.status).toBe(200);
    expect(assembled.body.data.target.type).toBe("SS");
    expect(assembled.body.data.content).toContain("Nested text.");
    expect(assembled.body.data.content).not.toContain("Intro text.");
    expect(assembled.body.data.content).toBe(await project(assembled.body.data.target.fcid));
  });

  it("C06: range selects a window of sections without the document header", async () => {
    const doc = await importDoc("# One\n\nAlpha.\n\n# Two\n\nBeta.\n\n# Three\n\nGamma.");
    const result = await post("/v1/lab05/assemble", { target: doc.fcas, range: { from: 1, to: 2 } });
    expect(result.status).toBe(200);
    const content = result.body.data.content as string;
    expect(content).toContain("# One");
    expect(content).toContain("Beta.");
    expect(content).not.toContain("Three");
    expect(content).not.toContain("Gamma.");
    expect(content).not.toContain("Untitled Document");
    expect(result.body.data.selection).toEqual({ from: 1, to: 2, total: 3, roles: null });
    expect(result.body.data.manifest.filter((m: { role: string }) => m.role === "selected")).toHaveLength(2);

    const clamped = await post("/v1/lab05/assemble", { target: doc.fcas, range: { from: 2, to: 10 } });
    expect(clamped.body.data.selection).toEqual({ from: 2, to: 3, total: 3, roles: null });
    expect(clamped.body.data.content).toContain("Gamma.");

    const openEnded = await post("/v1/lab05/assemble", { target: doc.fcas, range: { from: 3 } });
    expect(openEnded.body.data.content).toContain("# Three");
    expect(openEnded.body.data.content).not.toContain("Alpha.");
  });

  it("C07: message range uses the FCAS numbering and omits chat headers", async () => {
    const chat = await createChat(CHAT_MESSAGES);
    const window = await post("/v1/lab05/assemble", { target: chat.fcas, range: { from: 2, to: 3 } });
    expect(window.status).toBe(200);
    const content = window.body.data.content as string;
    expect(content).toContain("Msg two.");
    expect(content).toContain("Msg three.");
    expect(content).not.toContain("Msg one.");
    expect(content).not.toContain("Msg four.");

    const single = await post("/v1/lab05/assemble", { target: chat.fcas, range: { from: 2, to: 2 } });
    const byFcas = await post("/v1/lab05/assemble", { target: `[[${chat.resourceKey}<2>]]` });
    expect(single.body.data.content).toBe(byFcas.body.data.content);
  });

  it("C08: roles filter inside the window and never renumber", async () => {
    const chat = await createChat(CHAT_MESSAGES);
    const result = await post("/v1/lab05/assemble", {
      target: chat.fcas,
      range: { from: 2, to: 4 },
      roles: ["assistant"],
    });
    expect(result.status).toBe(200);
    const content = result.body.data.content as string;
    expect(content).toContain("Msg two.");
    expect(content).toContain("Msg four.");
    expect(content).not.toContain("Msg three.");
    expect(result.body.data.selection).toEqual({ from: 2, to: 4, total: 4, roles: ["assistant"] });
    expect(result.body.data.manifest.filter((m: { role: string }) => m.role === "selected")).toHaveLength(2);

    const outside = await post("/v1/lab05/assemble", { target: chat.fcas, range: { from: 1, to: 1 }, roles: ["assistant"] });
    expect(outside.status).toBe(200);
    expect(outside.body.data.content).toBe("");

    const rolesOnly = await post("/v1/lab05/assemble", { target: chat.fcas, roles: ["user"] });
    expect(rolesOnly.body.data.content).toContain("Msg one.");
    expect(rolesOnly.body.data.content).toContain("Msg three.");
    expect(rolesOnly.body.data.content).not.toContain("Msg two.");
  });

  it("C09: invalid windows return 422", async () => {
    const chat = await createChat(CHAT_MESSAGES);
    for (const range of [{ from: 0 }, { from: 5 }, { from: 99, to: 100 }, { from: 3, to: 2 }]) {
      const result = await post("/v1/lab05/assemble", { target: chat.fcas, range });
      expect(result.status).toBe(422);
      expect(result.body.code).toBe("INVALID_RANGE");
      expect(result.body.details.total).toBe(4);
    }
  });

  it("C10: range on a sentence and roles on a document return 422", async () => {
    const doc = await importDoc("# S\n\nOnly sentence.");
    const sn = firstSn(doc.dc);
    const onSentence = await post("/v1/lab05/assemble", { target: sn, range: { from: 1 } });
    expect(onSentence.status).toBe(422);
    expect(onSentence.body.code).toBe("NO_CHILDREN");

    const rolesOnDoc = await post("/v1/lab05/assemble", { target: doc.fcas, roles: ["user"] });
    expect(rolesOnDoc.status).toBe(422);
    expect(rolesOnDoc.body.code).toBe("ROLES_NOT_APPLICABLE");
  });

  it("C11: a block reference to a document is replaced by its content", async () => {
    const target = await importDoc("# Target Doc\n\nTarget body.");
    const host = await importDoc(`# Host\n\n${target.fcas}\n\nAfter.`);

    const result = await post("/v1/lab05/assemble", { target: host.fcas });
    expect(result.status).toBe(200);
    const content = result.body.data.content as string;
    expect(content).toContain("Target body.");
    expect(content).not.toContain(target.fcas);
    expect(content.indexOf("Target body.")).toBeLessThan(content.indexOf("After."));
    expect(result.body.data.manifest).toContainEqual({
      fcid: target.dc,
      type: "DC",
      role: "expanded",
      depth: 1,
      via: target.fcas,
    });
    expect(result.body.data.stats).toEqual({ expanded: 1, warnings: 0 });

    const off = await post("/v1/lab05/assemble", { target: host.fcas, expand: false });
    expect(off.body.data.content).toContain(target.fcas);
    expect(off.body.data.manifest).toHaveLength(1);
  });

  it("C12: an inline reference to a sentence is expanded inside the text", async () => {
    const source = await importDoc("# S\n\nRemember this fact.");
    const sn = firstSn(source.dc);
    const host = await importDoc(`# H\n\nAs said: [[${sn}]] is important.`);

    const result = await post("/v1/lab05/assemble", { target: host.fcas });
    expect(result.body.data.content).toContain("As said: Remember this fact. is important.");
    expect(result.body.data.manifest).toContainEqual({ fcid: sn, type: "SN", role: "expanded", depth: 1, via: `[[${sn}]]` });
  });

  it("C13: an inline reference to a container stays literal with a warning", async () => {
    const target = await importDoc("# Target\n\nTarget body.");
    const host = await importDoc(`# H\n\nSee ${target.fcas} for more.`);

    const result = await post("/v1/lab05/assemble", { target: host.fcas });
    expect(result.status).toBe(200);
    expect(result.body.data.content).toContain(`See ${target.fcas} for more.`);
    expect(result.body.data.content).not.toContain("Target body.");
    expect(result.body.data.warnings).toEqual([
      expect.objectContaining({ code: "BLOCK_REFERENCE_INLINE", fcas: target.fcas, depth: 0 }),
    ]);
    expect(result.body.data.stats).toEqual({ expanded: 0, warnings: 1 });
  });

  it("C14: expansion is recursive and stops at maxDepth", async () => {
    const c = await importDoc("# C\n\nLeaf text.");
    const b = await importDoc(`# B\n\n${c.fcas}`);
    const a = await importDoc(`# A\n\n${b.fcas}`);

    const full = await post("/v1/lab05/assemble", { target: a.fcas });
    expect(full.body.data.content).toContain("Leaf text.");
    expect(full.body.data.manifest.filter((m: { role: string }) => m.role === "expanded").map((m: { depth: number }) => m.depth)).toEqual([1, 2]);
    expect(full.body.data.warnings).toEqual([]);

    const shallow = await post("/v1/lab05/assemble", { target: a.fcas, maxDepth: 1 });
    expect(shallow.body.data.content).not.toContain("Leaf text.");
    expect(shallow.body.data.content).toContain(c.fcas);
    expect(shallow.body.data.warnings).toEqual([
      expect.objectContaining({ code: "DEPTH_EXCEEDED", fcas: c.fcas, depth: 1 }),
    ]);
  });

  it("C15: cycles terminate with a warning", async () => {
    const xKey = `${unique("cycle-x")}.md`;
    const yKey = `${unique("cycle-y")}.md`;
    await post("/v1/lab01/import/document", { resourceKey: xKey, title: "x", text: `# X\n\n[[${yKey}]]` });
    await post("/v1/lab01/import/document", { resourceKey: yKey, title: "y", text: `# Y\n\n[[${xKey}]]` });

    const result = await post("/v1/lab05/assemble", { target: `[[${xKey}]]` });
    expect(result.status).toBe(200);
    expect(result.body.data.warnings).toEqual([
      expect.objectContaining({ code: "CYCLE", fcas: `[[${xKey}]]`, depth: 1 }),
    ]);
    expect(result.body.data.stats.expanded).toBe(1);

    const selfKey = `${unique("cycle-self")}.md`;
    await post("/v1/lab01/import/document", { resourceKey: selfKey, title: "s", text: `# S\n\n[[${selfKey}]]` });
    const self = await post("/v1/lab05/assemble", { target: `[[${selfKey}]]` });
    expect(self.body.data.warnings).toEqual([expect.objectContaining({ code: "CYCLE", depth: 0 })]);
    expect(self.body.data.content).toContain(`[[${selfKey}]]`);
  });

  it("C16: missing and non-projectable references stay literal with warnings", async () => {
    const host = await importDoc("# H\n\n[[missing-doc.md]]\n\n[[$workspace]]\n\nTail.");
    const result = await post("/v1/lab05/assemble", { target: host.fcas });
    expect(result.status).toBe(200);
    const content = result.body.data.content as string;
    expect(content).toContain("[[missing-doc.md]]");
    expect(content).toContain("[[$workspace]]");
    expect(content).toContain("Tail.");
    expect(result.body.data.warnings.map((w: { code: string }) => w.code)).toEqual(["NOT_FOUND", "UNSUPPORTED_TARGET"]);
    expect(result.body.data.stats).toEqual({ expanded: 0, warnings: 2 });
  });

  it("C17: a block reference to a chat message is expanded", async () => {
    const chat = await createChat([
      { role: "user", text: "Question one." },
      { role: "assistant", text: "Answer two." },
    ]);
    const host = await importDoc(`# H\n\n[[${chat.resourceKey}<2>]]`);

    const result = await post("/v1/lab05/assemble", { target: host.fcas });
    expect(result.body.data.content).toContain("**assistant:**");
    expect(result.body.data.content).toContain("Answer two.");
    expect(result.body.data.content).not.toContain("Question one.");
    expect(result.body.data.manifest).toContainEqual(expect.objectContaining({ type: "MS", role: "expanded", depth: 1 }));

    const whole = await importDoc(`# H\n\n${chat.fcas}`);
    const wholeResult = await post("/v1/lab05/assemble", { target: whole.fcas });
    expect(wholeResult.body.data.content).toContain("Question one.");
    expect(wholeResult.body.data.content).toContain("Answer two.");
  });

  it("C18: a reference to a superseded sentence expands its current descendant", async () => {
    const source = await importDoc("# S\n\nOld claim.");
    const sn = firstSn(source.dc);
    const host = await importDoc(`# H\n\nQuote: [[${sn}]]`);
    const changed = await post("/v1/lab04/semantic-change", { fcid: sn, text: "New claim." });
    const current = changed.body.data.fcid as string;

    const result = await post("/v1/lab05/assemble", { target: host.fcas });
    expect(result.body.data.content).toContain("Quote: New claim.");
    expect(result.body.data.content).not.toContain("Old claim.");
    expect(result.body.data.manifest).toContainEqual({
      fcid: current,
      type: "SN",
      role: "expanded",
      depth: 1,
      via: `[[${sn}]]`,
      evolvedFrom: sn,
    });

    const direct = await post("/v1/lab05/assemble", { target: sn });
    expect(direct.status).toBe(200);
    expect(direct.body.data.content).toBe("New claim.");
    expect(direct.body.data.target).toMatchObject({ fcid: current, evolvedFrom: sn });
  });

  it("C19: a reference to a split sentence is ambiguous and stays literal", async () => {
    const source = await importDoc("# S\n\nFirst part; second part.");
    const sn = firstSn(source.dc);
    const host = await importDoc(`# H\n\nQuote: [[${sn}]]`);
    const split = await post("/v1/lab04/split", { fcid: sn, parts: ["First part;", "second part."] });
    const parts = split.body.data.fcids as string[];

    const result = await post("/v1/lab05/assemble", { target: host.fcas });
    expect(result.status).toBe(200);
    expect(result.body.data.content).toContain(`[[${sn}]]`);
    expect(result.body.data.warnings).toHaveLength(1);
    expect(result.body.data.warnings[0]).toMatchObject({ code: "AMBIGUOUS", fcas: `[[${sn}]]`, depth: 0 });
    expect([...result.body.data.warnings[0].candidates].sort()).toEqual([...parts].sort());

    const asTarget = await post("/v1/lab05/assemble", { target: sn });
    expect(asTarget.status).toBe(409);
    expect(asTarget.body.code).toBe("AMBIGUOUS");
    expect([...asTarget.body.details.candidates].sort()).toEqual([...parts].sort());
  });

  it("C20: expansion never changes the stored sentences", async () => {
    const target = await importDoc("# T\n\nStored target body.");
    const host = await importDoc(`# H\n\n${target.fcas}`);
    const before = sqliteClient
      .prepare("select fcid, metadata_json from artifacts where type = 'SN' order by fcid")
      .all();

    const assembled = await post("/v1/lab05/assemble", { target: host.fcas });
    expect(assembled.body.data.stats.expanded).toBe(1);

    const after = sqliteClient
      .prepare("select fcid, metadata_json from artifacts where type = 'SN' order by fcid")
      .all();
    expect(after).toEqual(before);
    expect(await project(host.dc)).toContain(target.fcas);
  });

  it("C21: standalone expansion honours format and reports only expanded entries", async () => {
    const target = await importDoc("# T\n\nTarget body.");
    const source = await importDoc("# S\n\nRemember this fact.");
    const sn = firstSn(source.dc);
    const text = `Intro line.\n\n${target.fcas}\n\nInline [[${sn}]] here.`;

    const markdown = await post("/v1/lab05/expand", { text });
    expect(markdown.status).toBe(200);
    expect(markdown.body.data.content).toContain("# Untitled Document");
    expect(markdown.body.data.content).toContain("Target body.");
    expect(markdown.body.data.content).toContain("Inline Remember this fact. here.");
    expect(markdown.body.data.content).not.toContain("[[");
    expect(markdown.body.data.manifest.every((m: { role: string }) => m.role === "expanded")).toBe(true);
    expect(markdown.body.data.stats).toEqual({ expanded: 2, warnings: 0 });

    const plain = await post("/v1/lab05/expand", { text, format: "text" });
    expect(plain.body.data.content).not.toContain("# ");
    expect(plain.body.data.content).toContain("Target body.");

    const untouched = await post("/v1/lab05/expand", { text: "No references here." });
    expect(untouched.body.data.content).toBe("No references here.");
    expect(untouched.body.data.manifest).toEqual([]);
  });

  it("rejects invalid targets and bodies", async () => {
    expect((await post("/v1/lab05/assemble", { target: "plain.md" })).status).toBe(400);
    expect((await post("/v1/lab05/assemble", {})).status).toBe(400);
    expect((await post("/v1/lab05/assemble", { target: "DC_X", maxDepth: 9 })).status).toBe(400);
    expect((await post("/v1/lab05/assemble", { target: "DC_X", roles: ["robot"] })).status).toBe(400);
    expect((await post("/v1/lab05/expand", {})).status).toBe(400);

    const missing = await post("/v1/lab05/assemble", { target: "[[no-such-document.md]]" });
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("NOT_FOUND");

    const unknownFcid = await post("/v1/lab05/assemble", { target: "DC_UNKNOWN" });
    expect(unknownFcid.status).toBe(404);

    const workspace = await post("/v1/lab05/assemble", { target: "[[$workspace]]" });
    expect(workspace.status).toBe(409);
    expect(workspace.body.code).toBe("UNSUPPORTED_SCOPE");
  });

  it("assembles by bare FCID and follows lineage for the target", async () => {
    const doc = await importDoc("# S\n\nBare target.");
    const byFcid = await post("/v1/lab05/assemble", { target: doc.dc, expand: false });
    expect(byFcid.status).toBe(200);
    expect(byFcid.body.data.target).toMatchObject({ raw: `[[${doc.dc}]]`, fcid: doc.dc, type: "DC", evolvedFrom: null });
  });
});
