import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../api/app.js";
import { sqliteClient } from "../db/client.js";
import { resetAndSeed } from "../seeds/seed.js";

// Lab 06 — Synthetic Projection. Scenarios C01–C22 from docs/lab 06.md.

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

function textOf(fcid: string): string {
  const row = sqliteClient.prepare("select metadata_json from artifacts where fcid = ?").get(fcid) as { metadata_json: string };
  return String(JSON.parse(row.metadata_json).text);
}

function isActive(fcid: string): boolean {
  const row = sqliteClient.prepare("select state from artifacts where fcid = ?").get(fcid) as { state: string } | undefined;
  return row?.state === "active";
}

async function post(url: string, payload: unknown) {
  const response = await app.inject({ method: "POST", url, payload: payload as Record<string, unknown> });
  return { status: response.statusCode, body: response.json() as Record<string, any> };
}

const synth = (payload: Record<string, unknown>) => post("/v1/lab06/synthesize", payload);

async function importDoc(text: string, name = unique("doc")) {
  const resourceKey = `${name}.md`;
  const { body } = await post("/v1/lab01/import/document", { resourceKey, title: name, text });
  return { resourceKey, fcas: `[[${resourceKey}]]`, dc: body.data.rootFcid as string };
}

/** For a document with one top heading: its SS and that section's paragraphs. */
function sectionOf(dc: string) {
  const ss = childrenOf(dc)[0];
  return { ss, pgs: childrenOf(ss) };
}

async function createChat(messages: Array<{ role: string; text: string }>) {
  const resourceKey = `::${unique("synth-chat")}`;
  const chat = await post("/v1/lab01/chat/create", { resourceKey, title: resourceKey });
  const chatFcid = chat.body.data.chatFcid as string;
  for (const message of messages) await post(`/v1/lab01/chat/${chatFcid}/messages`, message);
  return { resourceKey, chatFcid, msgs: childrenOf(chatFcid) };
}

async function project(fcid: string): Promise<string> {
  const { body } = await post("/v1/lab02/project", { artifactFcid: fcid, targetFormat: "markdown" });
  return body.data.content as string;
}

function snapshot(): Record<string, unknown[]> {
  const tables = ["artifacts", "artifact_edges", "artifact_lineage", "evolution_events", "projections", "references", "resource_bindings"];
  return Object.fromEntries(tables.map((table) => [table, sqliteClient.prepare(`select * from "${table}" order by rowid`).all()]));
}

const CHAT_MESSAGES = [
  { role: "user", text: "Msg one." },
  { role: "assistant", text: "Msg two." },
  { role: "user", text: "Msg three." },
  { role: "assistant", text: "Msg four." },
];

describe("Lab 06 — Synthetic Projection", () => {
  it("C01: a document is composed from paragraphs of different documents", async () => {
    const a = await importDoc("# A\n\nAlpha one.\n\nAlpha two.");
    const b = await importDoc("# B\n\nBeta one.");
    const [a1, a2] = sectionOf(a.dc).pgs;
    const [b1] = sectionOf(b.dc).pgs;

    const result = await synth({ kind: "document", title: "Resumo", items: [a1, a2, b1] });
    expect(result.status).toBe(200);
    expect(result.body.data.content).toBe("# Resumo\n\nAlpha one.\n\nAlpha two.\n\nBeta one.");
    expect(result.body.data).toMatchObject({ kind: "document", mode: "selection", title: "Resumo", random: null });
    expect(result.body.data.manifest).toEqual([
      { fcid: a1, type: "PG", role: "item", depth: 0, position: 1 },
      { fcid: a2, type: "PG", role: "item", depth: 0, position: 2 },
      { fcid: b1, type: "PG", role: "item", depth: 0, position: 3 },
    ]);
    expect(result.body.data.stats).toEqual({ items: 3, expanded: 0, warnings: 0 });
  });

  it("C02: I2 — a section rebuilt from its paragraphs equals the Lab 05 partial assembly", async () => {
    const doc = await importDoc("# S\n\nP1 text.\n\nP2 text.\n\nP3 text.");
    const { ss, pgs } = sectionOf(doc.dc);
    const assembled = await post("/v1/lab05/assemble", { target: ss, range: { from: 1, to: 3 }, expand: false });
    const synthesized = await synth({ kind: "document", items: pgs, expand: false });
    expect(synthesized.body.data.content).toBe(assembled.body.data.content);
  });

  it("C03: document accepts SS and SN and rejects MS", async () => {
    const doc = await importDoc("# S\n\nP1 text.\n\nP2 text.");
    const { ss, pgs } = sectionOf(doc.dc);
    const sn = childrenOf(pgs[0])[0];

    const accepted = await synth({ kind: "document", items: [ss, sn] });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.content).toBe("# S\n\nP1 text.\n\nP2 text.\n\nP1 text.");

    const chat = await createChat([{ role: "user", text: "A message." }]);
    const rejected = await synth({ kind: "document", items: [pgs[0], chat.msgs[0]] });
    expect(rejected.status).toBe(422);
    expect(rejected.body.code).toBe("ITEM_TYPE_NOT_ALLOWED");
    expect(rejected.body.details).toMatchObject({ position: 2, type: "MS", kind: "document", allowed: ["SN", "PG", "SS"] });
  });

  it("C04: a chat is composed from messages of different chats, keeping roles", async () => {
    const one = await createChat([
      { role: "user", text: "Hello there." },
      { role: "assistant", text: "General reply." },
    ]);
    const two = await createChat([
      { role: "user", text: "Other question." },
      { role: "assistant", text: "Other answer." },
    ]);

    const result = await synth({ kind: "chat", items: [one.msgs[0], two.msgs[1], two.msgs[0]] });
    expect(result.status).toBe(200);
    expect(result.body.data.content).toBe(
      "**user:**\n\nHello there.\n\n**assistant:**\n\nOther answer.\n\n**user:**\n\nOther question.",
    );
    expect(result.body.data.manifest.map((m: { type: string }) => m.type)).toEqual(["MS", "MS", "MS"]);
  });

  it("C05: I1 — a chat rebuilt from all its messages equals the chat projection", async () => {
    const chat = await createChat(CHAT_MESSAGES);
    const result = await synth({ kind: "chat", items: chat.msgs, expand: false });
    expect(result.body.data.content).toBe(await project(chat.chatFcid));
  });

  it("C06: chat rejects paragraphs, titles and templates", async () => {
    const chat = await createChat([{ role: "user", text: "A message." }]);
    const doc = await importDoc("# S\n\nA paragraph.");
    const pg = sectionOf(doc.dc).pgs[0];

    const wrongType = await synth({ kind: "chat", items: [chat.msgs[0], pg] });
    expect(wrongType.status).toBe(422);
    expect(wrongType.body.details).toMatchObject({ position: 2, type: "PG", allowed: ["MS"] });

    expect((await synth({ kind: "chat", title: "No title", items: chat.msgs })).status).toBe(400);
    expect((await synth({ kind: "chat", template: `[[${chat.msgs[0]}]]` })).status).toBe(400);
  });

  it("C07: a free view mixes sentences, paragraphs and messages", async () => {
    const doc = await importDoc("# S\n\nParagraph text.");
    const pg = sectionOf(doc.dc).pgs[0];
    const sn = childrenOf(pg)[0];
    const chat = await createChat([{ role: "assistant", text: "Message text." }]);

    const result = await synth({ items: [sn, pg, chat.msgs[0]] });
    expect(result.status).toBe(200);
    expect(result.body.data.kind).toBe("view");
    expect(result.body.data.content).toBe("Paragraph text.\n\nParagraph text.\n\n**assistant:**\n\nMessage text.");
    expect(result.body.data.manifest.map((m: { type: string }) => m.type)).toEqual(["SN", "PG", "MS"]);
  });

  it("C08: items can be FCAS references", async () => {
    const doc = await importDoc("# S\n\nSection text.", unique("fcas-doc"));
    const chat = await createChat(CHAT_MESSAGES);

    const result = await synth({ items: [`[[${doc.resourceKey}#S]]`, `[[${chat.resourceKey}<2>]]`] });
    expect(result.status).toBe(200);
    expect(result.body.data.content).toBe("# S\n\nSection text.\n\n**assistant:**\n\nMsg two.");
    expect(result.body.data.manifest.map((m: { type: string }) => m.type)).toEqual(["SS", "MS"]);
  });

  it("C09: explicit items are strict and report their position", async () => {
    const doc = await importDoc("# S\n\nA paragraph.");
    const pg = sectionOf(doc.dc).pgs[0];

    const missing = await synth({ items: [pg, "PG_NOTHERE"] });
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ code: "ITEM_NOT_FOUND", details: { position: 2 } });

    const invalid = await synth({ items: ["plain-text"] });
    expect(invalid.status).toBe(422);
    expect(invalid.body).toMatchObject({ code: "INVALID_ITEM", details: { position: 1 } });

    const container = await synth({ items: [doc.dc] });
    expect(container.status).toBe(422);
    expect(container.body).toMatchObject({ code: "ITEM_TYPE_NOT_ALLOWED", details: { position: 1, type: "DC" } });

    const workspace = await synth({ items: [pg, "[[$workspace]]"] });
    expect(workspace.status).toBe(422);
    expect(workspace.body).toMatchObject({ code: "ITEM_TYPE_NOT_ALLOWED", details: { position: 2 } });
  });

  it("C10: the same item can appear more than once", async () => {
    const doc = await importDoc("# S\n\nRepeat me.");
    const pg = sectionOf(doc.dc).pgs[0];
    const result = await synth({ items: [pg, pg] });
    expect(result.body.data.content).toBe("Repeat me.\n\nRepeat me.");
    expect(result.body.data.manifest.map((m: { position: number }) => m.position)).toEqual([1, 2]);
  });

  it("C11: random picks sentences from the pool and reports how", async () => {
    const result = await synth({ random: { type: "SN", count: 5, seed: 7 }, expand: false });
    expect(result.status).toBe(200);
    const data = result.body.data;
    expect(data.mode).toBe("random");
    expect(data.random).toMatchObject({ type: "SN", requested: 5, picked: 5, seed: 7, scope: null });
    expect(data.random.poolSize).toBeGreaterThanOrEqual(5);

    const fcids = data.manifest.map((m: { fcid: string }) => m.fcid) as string[];
    expect(new Set(fcids).size).toBe(5);
    expect(fcids.every((fcid) => fcid.startsWith("SN_") && isActive(fcid))).toBe(true);
    expect(data.manifest.map((m: { position: number }) => m.position)).toEqual([1, 2, 3, 4, 5]);
    expect(data.content).toBe(fcids.map(textOf).join("\n\n"));

    const noSeed = await synth({ random: { type: "SN", count: 3 }, expand: false });
    const generated = noSeed.body.data.random.seed as number;
    expect(Number.isInteger(generated) && generated >= 0 && generated < 2 ** 32).toBe(true);
    const replay = await synth({ random: { type: "SN", count: 3, seed: generated }, expand: false });
    expect(replay.body.data.content).toBe(noSeed.body.data.content);
  });

  it("C12: I3 — the same seed reproduces the view and different seeds differ", async () => {
    const request = (seed: number) => synth({ random: { type: "SN", count: 5, seed }, expand: false });
    const first = await request(123);
    const second = await request(123);
    expect(first.body.data.random.poolSize).toBeGreaterThan(9);
    expect(second.body.data.content).toBe(first.body.data.content);
    expect(second.body.data.manifest).toEqual(first.body.data.manifest);

    const other = await request(124);
    const order = (r: typeof first) => r.body.data.manifest.map((m: { fcid: string }) => m.fcid);
    expect(order(other)).not.toEqual(order(first));
  });

  it("C13: count is reduced to the pool, an empty pool and a bad scope are errors", async () => {
    const doc = await importDoc("# S\n\nOne. Two. Three.");

    const reduced = await synth({ random: { type: "SN", count: 10, seed: 1, scope: doc.fcas }, expand: false });
    expect(reduced.status).toBe(200);
    expect(reduced.body.data.random).toMatchObject({ requested: 10, picked: 3, poolSize: 3, scope: doc.fcas });
    expect(reduced.body.data.stats.items).toBe(3);

    const empty = await synth({ random: { type: "MS", count: 2, scope: doc.fcas } });
    expect(empty.status).toBe(422);
    expect(empty.body.code).toBe("EMPTY_POOL");

    const unknownScope = await synth({ random: { type: "SN", count: 1, scope: "[[no-such-scope.md]]" } });
    expect(unknownScope.status).toBe(404);
    expect(unknownScope.body.code).toBe("SCOPE_NOT_FOUND");

    const invalidScope = await synth({ random: { type: "SN", count: 1, scope: "plain" } });
    expect(invalidScope.status).toBe(422);
    expect(invalidScope.body.code).toBe("INVALID_SCOPE");
  });

  it("C14: scope restricts the pool and superseded artifacts are never drawn", async () => {
    const x = await importDoc("# X\n\nX one. X two. X three.");
    await importDoc("# Y\n\nY one. Y two. Y three.");
    const xSn = childrenOf(sectionOf(x.dc).pgs[0]);

    const scoped = await synth({ random: { type: "SN", count: 50, seed: 5, scope: x.fcas }, expand: false });
    expect([...scoped.body.data.manifest.map((m: { fcid: string }) => m.fcid)].sort()).toEqual([...xSn].sort());

    const changed = await post("/v1/lab04/semantic-change", { fcid: xSn[0], text: "X replaced." });
    const newSn = changed.body.data.fcid as string;
    const after = await synth({ random: { type: "SN", count: 50, seed: 5, scope: x.fcas }, expand: false });
    const picked = after.body.data.manifest.map((m: { fcid: string }) => m.fcid) as string[];
    expect([...picked].sort()).toEqual([xSn[1], xSn[2], newSn].sort());
    expect(picked).not.toContain(xSn[0]);

    // Without a scope the superseded artifact is still in the table: only the state filter keeps it out.
    const chat = await createChat(CHAT_MESSAGES);
    const oldMs = chat.msgs[1];
    const regenerated = await post("/v1/lab04/regenerate", { fcid: oldMs, text: "Regenerated answer." });
    const newMs = regenerated.body.data.fcid as string;
    const unscoped = await synth({ random: { type: "MS", count: 50, seed: 9 }, expand: false });
    const drawn = unscoped.body.data.manifest.map((m: { fcid: string }) => m.fcid) as string[];
    const activeMs = (sqliteClient.prepare("select count(*) as n from artifacts where type = 'MS' and state = 'active'").get() as { n: number }).n;
    // Following lineage would turn a drawn superseded MS into its replacement, hiding the defect in the
    // manifest, so the pool itself must hold only active artifacts and nothing may be drawn twice.
    expect(unscoped.body.data.random.poolSize).toBe(activeMs);
    expect(unscoped.body.data.random.picked).toBe(activeMs);
    expect(new Set(drawn).size).toBe(drawn.length);
    expect(unscoped.body.data.manifest.some((m: { evolvedFrom?: string }) => m.evolvedFrom)).toBe(false);
    expect(drawn).toContain(newMs);
    expect(drawn).not.toContain(oldMs);
  });

  it("C15: a random type outside the kind is rejected", async () => {
    const asDocument = await synth({ kind: "document", random: { type: "MS", count: 1 } });
    expect(asDocument.status).toBe(422);
    expect(asDocument.body).toMatchObject({ code: "ITEM_TYPE_NOT_ALLOWED", details: { type: "MS", kind: "document" } });

    const asChat = await synth({ kind: "chat", random: { type: "PG", count: 1 } });
    expect(asChat.status).toBe(422);
    expect(asChat.body.code).toBe("ITEM_TYPE_NOT_ALLOWED");

    const chat = await createChat(CHAT_MESSAGES);
    const messages = await synth({ kind: "chat", random: { type: "MS", count: 2, seed: 3, scope: `[[${chat.resourceKey}]]` } });
    expect(messages.status).toBe(200);
    expect(messages.body.data.content).toContain("**");
  });

  it("C16: a template of FCAS references composes the view in blocks", async () => {
    const doc = await importDoc("# A\n\nAlpha one.\n\nAlpha two.");
    const [a1, a2] = sectionOf(doc.dc).pgs;
    const chat = await createChat([{ role: "user", text: "Hello there." }]);
    const template = `[[${a1}]]\n\n[[${a2}]]\n\n[[${chat.msgs[0]}]]`;

    const result = await synth({ template });
    expect(result.status).toBe(200);
    expect(result.body.data.content).toBe("Alpha one.\n\nAlpha two.\n\n**user:**\n\nHello there.");
    expect(result.body.data).toMatchObject({ mode: "template", random: null });
    expect(result.body.data.manifest).toEqual([
      { fcid: a1, type: "PG", role: "expanded", depth: 1, via: `[[${a1}]]` },
      { fcid: a2, type: "PG", role: "expanded", depth: 1, via: `[[${a2}]]` },
      { fcid: chat.msgs[0], type: "MS", role: "expanded", depth: 1, via: `[[${chat.msgs[0]}]]` },
    ]);
    expect(result.body.data.stats).toEqual({ items: 0, expanded: 3, warnings: 0 });
  });

  it("C17: an inline message reference stays literal and bad references warn", async () => {
    const chat = await createChat([{ role: "user", text: "Hello there." }]);
    const inline = `Before [[${chat.msgs[0]}]] after.`;

    const result = await synth({ template: inline });
    expect(result.status).toBe(200);
    expect(result.body.data.content).toBe(inline);
    expect(result.body.data.warnings).toEqual([
      expect.objectContaining({ code: "BLOCK_REFERENCE_INLINE", fcas: `[[${chat.msgs[0]}]]`, depth: 0 }),
    ]);
    expect(result.body.data.manifest).toEqual([]);

    const missing = await synth({ template: "Intro.\n\n[[missing-synth-doc.md]]" });
    expect(missing.body.data.content).toBe("Intro.\n\n[[missing-synth-doc.md]]");
    expect(missing.body.data.warnings).toEqual([expect.objectContaining({ code: "NOT_FOUND" })]);
  });

  it("C18: a template can carry a title and expand false returns it as written", async () => {
    const doc = await importDoc("# A\n\nAlpha one.");
    const pg = sectionOf(doc.dc).pgs[0];
    const template = `Intro.\n\n[[${pg}]]`;

    const literal = await synth({ kind: "document", title: "T", template, expand: false });
    expect(literal.body.data.content).toBe(`# T\n\n${template}`);
    expect(literal.body.data.manifest).toEqual([]);
    expect(literal.body.data.warnings).toEqual([]);

    const expanded = await synth({ kind: "document", title: "T", template });
    expect(expanded.body.data.content).toBe("# T\n\nIntro.\n\nAlpha one.");
  });

  it("C19: a superseded item uses its current version and a split item is ambiguous", async () => {
    const doc = await importDoc("# S\n\nOld claim.\n\nSplit part one; part two.");
    const [pg1, pg2] = sectionOf(doc.dc).pgs;
    const sn1 = childrenOf(pg1)[0];
    const sn2 = childrenOf(pg2)[0];

    const changed = await post("/v1/lab04/semantic-change", { fcid: sn1, text: "New claim." });
    const current = changed.body.data.fcid as string;
    const evolved = await synth({ items: [sn1] });
    expect(evolved.status).toBe(200);
    expect(evolved.body.data.content).toBe("New claim.");
    expect(evolved.body.data.manifest[0]).toEqual({ fcid: current, type: "SN", role: "item", depth: 0, position: 1, evolvedFrom: sn1 });

    const split = await post("/v1/lab04/split", { fcid: sn2, parts: ["Split part one;", "part two."] });
    const ambiguous = await synth({ items: [sn1, sn2] });
    expect(ambiguous.status).toBe(409);
    expect(ambiguous.body.code).toBe("ITEM_AMBIGUOUS");
    expect(ambiguous.body.details.position).toBe(2);
    expect([...ambiguous.body.details.candidates].sort()).toEqual([...split.body.data.fcids].sort());
  });

  it("C20: references inside an item are expanded and tagged with its position", async () => {
    const srcName = unique("synth-src");
    const src = await importDoc("# Src\n\nSrc body.", srcName);
    const host = await importDoc(`# H\n\n${src.fcas}\n\n[[missing-synth-doc.md]]`);
    const [p1, p2] = sectionOf(host.dc).pgs;

    const result = await synth({ kind: "document", items: [p1, p2] });
    expect(result.status).toBe(200);
    expect(result.body.data.content).toContain("Src body.");
    expect(result.body.data.content).toContain("[[missing-synth-doc.md]]");
    expect(result.body.data.manifest).toContainEqual({
      fcid: src.dc,
      type: "DC",
      role: "expanded",
      depth: 1,
      position: 1,
      via: src.fcas,
    });
    expect(result.body.data.warnings).toEqual([
      expect.objectContaining({ code: "NOT_FOUND", fcas: "[[missing-synth-doc.md]]", depth: 0, position: 2 }),
    ]);
    expect(result.body.data.stats).toEqual({ items: 2, expanded: 1, warnings: 1 });

    const literal = await synth({ kind: "document", items: [p1, p2], expand: false });
    expect(literal.body.data.content).toBe(`${src.fcas}\n\n[[missing-synth-doc.md]]`);
    expect(literal.body.data.stats).toEqual({ items: 2, expanded: 0, warnings: 0 });
  });

  it("C21: I4 — synthesizing never changes the sources", async () => {
    const doc = await importDoc("# S\n\nOne. Two.\n\nThree.");
    const { pgs } = sectionOf(doc.dc);
    const chat = await createChat(CHAT_MESSAGES);
    await post("/v1/lab04/semantic-change", { fcid: childrenOf(pgs[0])[0], text: "One changed." });

    const before = snapshot();
    await synth({ kind: "document", title: "T", items: pgs });
    await synth({ kind: "chat", items: chat.msgs });
    await synth({ random: { type: "SN", count: 8 } });
    await synth({ random: { type: "PG", count: 3, scope: doc.fcas } });
    await synth({ template: `[[${pgs[0]}]]\n\n[[${chat.msgs[0]}]]\n\n[[missing-synth-doc.md]]` });
    await synth({ items: ["PG_NOTHERE"] });
    expect(snapshot()).toEqual(before);
  });

  it("C22: validates the body and honours the text format", async () => {
    const doc = await importDoc("# S\n\nP1 text.\n\nP2 text.");
    const { ss, pgs } = sectionOf(doc.dc);

    expect((await synth({})).status).toBe(400);
    expect((await synth({ items: [pgs[0]], template: "x" })).status).toBe(400);
    expect((await synth({ items: [pgs[0]], random: { type: "SN", count: 1 } })).status).toBe(400);
    expect((await synth({ items: [] })).status).toBe(400);
    expect((await synth({ items: Array.from({ length: 201 }, () => pgs[0]) })).status).toBe(400);
    expect((await synth({ random: { type: "SN", count: 0 } })).status).toBe(400);
    expect((await synth({ random: { type: "SN", count: 51 } })).status).toBe(400);
    expect((await synth({ random: { type: "SN", count: 1, seed: -1 } })).status).toBe(400);
    expect((await synth({ random: { type: "DC", count: 1 } })).status).toBe(400);
    expect((await synth({ items: [pgs[0]], maxDepth: 6 })).status).toBe(400);
    expect((await synth({ items: [pgs[0]], format: "html" })).status).toBe(400);
    expect((await synth({ kind: "folder", items: [pgs[0]] })).status).toBe(400);

    const text = await synth({ title: "Resumo", items: [ss], format: "text" });
    expect(text.status).toBe(200);
    expect(text.body.data.content).toBe("Resumo\n\nS\n\nP1 text.\n\nP2 text.");
    expect(text.body.data.content).not.toContain("# ");
    expect(text.body.data.format).toBe("text");
  });

  // Resets the database, so it must stay the last test of the file.
  it("C23: the draw never brings content from a regenerated message", async () => {
    await resetAndSeed();
    const chat = await createChat([
      { role: "user", text: "A question." },
      { role: "assistant", text: "Stale answer sentence." },
    ]);
    const oldMs = chat.msgs[1];
    const oldPg = childrenOf(oldMs)[0];
    const oldSn = childrenOf(oldPg)[0];
    const regenerated = await post("/v1/lab04/regenerate", { fcid: oldMs, text: "Fresh answer sentence." });
    expect(regenerated.status).toBe(200);

    for (const [type, stale] of [["SN", oldSn], ["PG", oldPg], ["MS", oldMs]] as const) {
      const result = await synth({ random: { type, count: 50, seed: 3 }, expand: false });
      expect(result.status).toBe(200);
      // The pool is tiny here, so the whole pool is drawn and an absent FCID is really absent.
      expect(result.body.data.random.picked).toBe(result.body.data.random.poolSize);
      const drawn = result.body.data.manifest.map((m: { fcid: string }) => m.fcid) as string[];
      expect(drawn).not.toContain(stale);
      expect(result.body.data.content).not.toContain("Stale answer sentence.");
    }
  });
});
