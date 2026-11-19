import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../api/app.js";
import { sqliteClient } from "../db/client.js";
import { resetAndSeed } from "../seeds/seed.js";

// Lab 04 — Evolution & Lineage. Scenarios C01–C16 from docs/lab 04.md.

const app = buildApp();

beforeAll(async () => {
  await resetAndSeed();
});

afterAll(async () => {
  await app.close();
});

let docCounter = 0;

const DOC_TEXT = [
  "# Evolution",
  "",
  "FCIDs provide persistent identty. FCIDs are persistent; FCAS is human readable.",
  "",
  "Third one. Fourth one.",
  "",
  "Fifth one.",
].join("\n");

function childrenOf(fcid: string): string[] {
  return (
    sqliteClient
      .prepare("select child_fcid from artifact_edges where parent_fcid = ? and relation_type = 'contains' order by order_index")
      .all(fcid) as Array<{ child_fcid: string }>
  ).map((r) => r.child_fcid);
}

function stateOf(fcid: string): string {
  return (sqliteClient.prepare("select state from artifacts where fcid = ?").get(fcid) as { state: string }).state;
}

function textOf(fcid: string): string {
  const row = sqliteClient.prepare("select metadata_json from artifacts where fcid = ?").get(fcid) as { metadata_json: string };
  return String(JSON.parse(row.metadata_json).text);
}

async function post(url: string, payload: unknown) {
  const response = await app.inject({ method: "POST", url, payload: payload as Record<string, unknown> });
  return { status: response.statusCode, body: response.json() as Record<string, any> };
}

async function get(url: string) {
  const response = await app.inject({ method: "GET", url });
  return { status: response.statusCode, body: response.json() as Record<string, any> };
}

async function importDoc() {
  docCounter += 1;
  const resourceKey = `evolution-${docCounter}.md`;
  const { body } = await post("/v1/lab01/import/document", { resourceKey, title: resourceKey, text: DOC_TEXT });
  const dc = body.data.rootFcid as string;
  const [ss] = childrenOf(dc);
  const [pg1, pg2, pg3] = childrenOf(ss);
  const [snTypo, snCompound] = childrenOf(pg1);
  return { resourceKey, dc, ss, pg1, pg2, pg3, snTypo, snCompound };
}

async function projectMarkdown(fcid: string): Promise<string> {
  const { body } = await post("/v1/lab02/project", { artifactFcid: fcid, targetFormat: "markdown" });
  return body.data.content as string;
}

describe("Lab 04 — Evolution & Lineage", () => {
  it("C01: edit of SN keeps FCID, bumps revision and updates projection", async () => {
    const doc = await importDoc();
    const res = await post("/v1/lab04/edit", { fcid: doc.snTypo, text: "FCIDs provide persistent identity." });
    expect(res.status).toBe(200);
    expect(res.body.data.fcid).toBe(doc.snTypo);
    expect(res.body.data.revision).toBe(2);
    expect(res.body.data.classification.suggestion).toBe("edit");
    expect(childrenOf(doc.pg1)[0]).toBe(doc.snTypo);
    expect(stateOf(doc.snTypo)).toBe("active");
    expect(await projectMarkdown(doc.dc)).toContain("FCIDs provide persistent identity.");

    const lineage = await get(`/v1/lab04/lineage/${doc.snTypo}`);
    expect(lineage.body.data.ancestors).toEqual([]);
    expect(lineage.body.data.events).toHaveLength(1);
    expect(lineage.body.data.events[0].before.text).toBe("FCIDs provide persistent identty.");
  });

  it("C02: edit of SS title keeps FCID; old title FCAS stops resolving, references stay valid", async () => {
    const doc = await importDoc();
    const ref = await post("/v1/lab03/references", { sourceFcid: doc.dc, fcas: `[[${doc.resourceKey}#Evolution]]` });
    expect(ref.body.data.targetFcid).toBe(doc.ss);

    const res = await post("/v1/lab04/edit", { fcid: doc.ss, title: "Overview" });
    expect(res.status).toBe(200);
    expect(res.body.data.fcid).toBe(doc.ss);

    expect((await post("/v1/lab03/resolve", { fcas: `[[${doc.resourceKey}#Evolution]]` })).status).toBe(404);
    const renamed = await post("/v1/lab03/resolve", { fcas: `[[${doc.resourceKey}#Overview]]` });
    expect(renamed.body.data.targetFcid).toBe(doc.ss);

    const continuity = await get(`/v1/lab04/references/${ref.body.data.referenceId}`);
    expect(continuity.body.data).toMatchObject({ status: "resolved", currentFcids: [doc.ss] });
  });

  it("C03: semantic change creates a new SN in the same position", async () => {
    const doc = await importDoc();
    const res = await post("/v1/lab04/semantic-change", { fcid: doc.snTypo, text: "FCIDs provide versioned identity." });
    expect(res.status).toBe(200);
    const newFcid = res.body.data.fcid as string;
    expect(newFcid).toMatch(/^SN_[A-Z0-9]{6}$/);
    expect(newFcid).not.toBe(doc.snTypo);
    expect(childrenOf(doc.pg1)).toEqual([newFcid, doc.snCompound]);
    expect(stateOf(doc.snTypo)).toBe("superseded");

    const markdown = await projectMarkdown(doc.dc);
    expect(markdown).toContain("FCIDs provide versioned identity.");
    expect(markdown).not.toContain("identty");

    const lineage = await get(`/v1/lab04/lineage/${newFcid}`);
    expect(lineage.body.data.ancestors).toEqual([
      expect.objectContaining({ fcid: doc.snTypo, relation: "evolves_from", depth: 1, state: "superseded" }),
    ]);
  });

  it("C04: operations on a superseded artifact return 409", async () => {
    const doc = await importDoc();
    const changed = await post("/v1/lab04/semantic-change", { fcid: doc.snTypo, text: "Something else entirely." });
    const res = await post("/v1/lab04/edit", { fcid: doc.snTypo, text: "Late edit." });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SUPERSEDED");
    expect(res.body.details.current).toEqual([changed.body.data.fcid]);
  });

  it("C05: split of SN preserves the projected text", async () => {
    const doc = await importDoc();
    const before = await projectMarkdown(doc.pg1);
    const res = await post("/v1/lab04/split", {
      fcid: doc.snCompound,
      parts: ["FCIDs are persistent.", "FCAS is human readable."],
    });
    expect(res.status).toBe(200);
    const [a, b] = res.body.data.fcids as string[];
    expect(childrenOf(doc.pg1)).toEqual([doc.snTypo, a, b]);
    expect(stateOf(doc.snCompound)).toBe("superseded");
    const after = await projectMarkdown(doc.pg1);
    expect(after.replace(/[;.]/g, "")).toBe(before.replace(/[;.]/g, ""));
  });

  it("C06: split of SN that changes content returns 422", async () => {
    const doc = await importDoc();
    const res = await post("/v1/lab04/split", { fcid: doc.snCompound, parts: ["FCIDs are persistent.", "FCAS is great."] });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("CONTENT_CHANGED");
    expect(stateOf(doc.snCompound)).toBe("active");
  });

  it("C07: split of PG keeps the SN FCIDs", async () => {
    const doc = await importDoc();
    const res = await post("/v1/lab04/split", { fcid: doc.pg1, boundaries: [1] });
    expect(res.status).toBe(200);
    const [pgA, pgB] = res.body.data.fcids as string[];
    expect(childrenOf(doc.ss)).toEqual([pgA, pgB, doc.pg2, doc.pg3]);
    expect(childrenOf(pgA)).toEqual([doc.snTypo]);
    expect(childrenOf(pgB)).toEqual([doc.snCompound]);
    expect(childrenOf(doc.pg1)).toEqual([]);
    expect(await projectMarkdown(doc.dc)).toContain("identty.\n\nFCIDs are persistent;");

    const invalid = await post("/v1/lab04/split", { fcid: doc.pg2, boundaries: [2] });
    expect(invalid.status).toBe(422);
  });

  it("C08: merge of adjacent PG", async () => {
    const doc = await importDoc();
    const snPg2 = childrenOf(doc.pg2);
    const snPg3 = childrenOf(doc.pg3);
    const res = await post("/v1/lab04/merge", { fcids: [doc.pg3, doc.pg2] });
    expect(res.status).toBe(200);
    const merged = res.body.data.fcid as string;
    expect(res.body.data.supersededFcids).toEqual([doc.pg2, doc.pg3]);
    expect(childrenOf(doc.ss)).toEqual([doc.pg1, merged]);
    expect(childrenOf(merged)).toEqual([...snPg2, ...snPg3]);
    expect(await projectMarkdown(merged)).toBe("Third one. Fourth one. Fifth one.");

    const lineage = await get(`/v1/lab04/lineage/${merged}`);
    const relations = lineage.body.data.ancestors.map((a: { fcid: string; relation: string }) => `${a.relation}:${a.fcid}`);
    expect(relations.sort()).toEqual([`merged_from:${doc.pg2}`, `merged_from:${doc.pg3}`].sort());
  });

  it("C09: merge of non-adjacent or non-sibling artifacts returns 422", async () => {
    const doc = await importDoc();
    const notAdjacent = await post("/v1/lab04/merge", { fcids: [doc.pg1, doc.pg3] });
    expect(notAdjacent.status).toBe(422);
    expect(notAdjacent.body.code).toBe("NOT_ADJACENT");

    const other = await importDoc();
    const differentParents = await post("/v1/lab04/merge", { fcids: [doc.pg1, other.pg2] });
    expect(differentParents.status).toBe(422);
    expect(differentParents.body.code).toBe("DIFFERENT_PARENTS");

    const mixedTypes = await post("/v1/lab04/merge", { fcids: [doc.pg1, doc.snTypo] });
    expect(mixedTypes.status).toBe(422);
  });

  it("C10: editing a chat message evolves its SN and keeps the MS FCID", async () => {
    const chat = await post("/v1/lab01/chat/create", { resourceKey: "::evo-chat-edit", title: "Evo Chat" });
    const chatFcid = chat.body.data.chatFcid as string;
    const msg = await post(`/v1/lab01/chat/${chatFcid}/messages`, { role: "user", text: "Hello wrold." });
    const msFcid = msg.body.data.messageFcid as string;
    const [pg] = childrenOf(msFcid);
    const [sn] = childrenOf(pg);

    const res = await post("/v1/lab04/edit", { fcid: sn, text: "Hello world." });
    expect(res.status).toBe(200);
    expect(childrenOf(chatFcid)).toEqual([msFcid]);
    expect(stateOf(msFcid)).toBe("active");
    expect(await projectMarkdown(chatFcid)).toContain("Hello world.");
  });

  it("C11: regenerating a message makes [[::chat<n>]] resolve to the new MS", async () => {
    const chat = await post("/v1/lab01/chat/create", { resourceKey: "::evo-chat-regen", title: "Regen Chat" });
    const chatFcid = chat.body.data.chatFcid as string;
    await post(`/v1/lab01/chat/${chatFcid}/messages`, { role: "user", text: "What is a FCID?" });
    const answer = await post(`/v1/lab01/chat/${chatFcid}/messages`, { role: "assistant", text: "A file id." });
    const oldMs = answer.body.data.messageFcid as string;

    const res = await post("/v1/lab04/regenerate", { fcid: oldMs, text: "A persistent cognitive identifier." });
    expect(res.status).toBe(200);
    const newMs = res.body.data.fcid as string;
    expect(stateOf(oldMs)).toBe("superseded");

    const resolved = await post("/v1/lab03/resolve", { fcas: "[[::evo-chat-regen<2>]]" });
    expect(resolved.body.data.targetFcid).toBe(newMs);

    const markdown = await projectMarkdown(chatFcid);
    expect(markdown).toContain("A persistent cognitive identifier.");
    expect(markdown).not.toContain("A file id.");

    const userMs = childrenOf(chatFcid)[0];
    const roleMismatch = await post("/v1/lab04/merge", { fcids: [userMs, newMs] });
    expect(roleMismatch.status).toBe(422);
  });

  it("C12: lineage after semantic change followed by split", async () => {
    const doc = await importDoc();
    const changed = await post("/v1/lab04/semantic-change", {
      fcid: doc.snTypo,
      text: "FCIDs provide versioned identity; FCAS stays readable.",
    });
    const snB = changed.body.data.fcid as string;
    const split = await post("/v1/lab04/split", {
      fcid: snB,
      parts: ["FCIDs provide versioned identity.", "FCAS stays readable."],
    });
    const [snC, snD] = split.body.data.fcids as string[];

    const lineage = await get(`/v1/lab04/lineage/${snC}`);
    expect(lineage.body.data.ancestors).toEqual([
      expect.objectContaining({ fcid: snB, relation: "split_from", depth: 1 }),
      expect.objectContaining({ fcid: doc.snTypo, relation: "evolves_from", depth: 2 }),
    ]);

    const current = await get(`/v1/lab04/current/${doc.snTypo}`);
    expect(current.body.data).toEqual({ fcid: doc.snTypo, state: "superseded", current: [snC, snD] });

    const origin = await get(`/v1/lab04/lineage/${doc.snTypo}`);
    expect(origin.body.data.descendants.map((d: { fcid: string }) => d.fcid)).toEqual([snB, snC, snD]);
    expect(childrenOf(doc.pg1)).toEqual([snC, snD, doc.snCompound]);
  });

  it("C13: reference to a superseded SN resolves to its descendant", async () => {
    const doc = await importDoc();
    const ref = await post("/v1/lab03/references", { sourceFcid: doc.dc, fcas: `[[${doc.snTypo}]]` });
    const changed = await post("/v1/lab04/semantic-change", { fcid: doc.snTypo, text: "Completely new meaning." });
    const newFcid = changed.body.data.fcid as string;

    const continuity = await get(`/v1/lab04/references/${ref.body.data.referenceId}`);
    expect(continuity.body.data).toMatchObject({ targetFcid: doc.snTypo, status: "evolved", currentFcids: [newFcid] });

    const resolved = await post("/v1/lab03/resolve", { fcas: `[[${doc.snTypo}]]` });
    expect(resolved.body.data).toMatchObject({ targetFcid: newFcid, evolvedFrom: doc.snTypo });

    const fcas = await post("/v1/lab03/project-fcas", { targetFcid: doc.snTypo });
    expect(fcas.body.data.fcas).toBe(`[[${doc.snTypo}]]`);
  });

  it("C14: reference to a split SN is ambiguous", async () => {
    const doc = await importDoc();
    const ref = await post("/v1/lab03/references", { sourceFcid: doc.dc, fcas: `[[${doc.snCompound}]]` });
    const split = await post("/v1/lab04/split", {
      fcid: doc.snCompound,
      parts: ["FCIDs are persistent.", "FCAS is human readable."],
    });

    const continuity = await get(`/v1/lab04/references/${ref.body.data.referenceId}`);
    expect(continuity.body.data).toMatchObject({ status: "ambiguous", currentFcids: split.body.data.fcids });

    const resolved = await post("/v1/lab03/resolve", { fcas: `[[${doc.snCompound}]]` });
    expect(resolved.status).toBe(409);
    expect(resolved.body.details.candidates).toEqual(split.body.data.fcids);
  });

  it("C15: classifier suggests edit for typos and semantic change for new content", async () => {
    const doc = await importDoc();
    const typo = await post("/v1/lab04/classify", { fcid: doc.snTypo, text: "FCIDs provide persistent identity." });
    expect(typo.body.data).toMatchObject({ suggestion: "edit", reason: "token_level_typos" });

    const cosmetic = await post("/v1/lab04/classify", { fcid: doc.snTypo, text: "fcids provide PERSISTENT identty!" });
    expect(cosmetic.body.data).toMatchObject({ suggestion: "edit", reason: "identical_after_normalization" });

    const semantic = await post("/v1/lab04/classify", { fcid: doc.snTypo, text: "FCIDs provide versioned identity." });
    expect(semantic.body.data).toMatchObject({ suggestion: "semantic_change", reason: "content_changed" });

    const negation = await post("/v1/lab04/classify", { fcid: doc.snTypo, text: "FCIDs do not provide persistent identty." });
    expect(negation.body.data.suggestion).toBe("semantic_change");
  });

  it("C16: known limitation — one-letter meaning flips are suggested as edit", async () => {
    const res = await post("/v1/lab01/import/document", {
      resourceKey: "limitation.md",
      title: "limitation.md",
      text: "FCIDs are now stable.",
    });
    const [pg] = childrenOf(res.body.data.rootFcid);
    const [sn] = childrenOf(pg);
    const flip = await post("/v1/lab04/classify", { fcid: sn, text: "FCIDs are not stable." });
    expect(flip.body.data).toMatchObject({ suggestion: "edit", reason: "token_level_typos" });
  });

  it("rejects unsupported operations and keeps superseded artifacts out of the explorer roots", async () => {
    const doc = await importDoc();
    expect((await post("/v1/lab04/edit", { fcid: doc.pg1, text: "x" })).status).toBe(422);
    expect((await post("/v1/lab04/semantic-change", { fcid: doc.ss, text: "x" })).status).toBe(422);
    expect((await post("/v1/lab04/split", { fcid: doc.ss, boundaries: [1] })).status).toBe(422);
    expect((await post("/v1/lab04/edit", { fcid: doc.snTypo, text: "FCIDs provide persistent identty." })).status).toBe(422);
    expect((await post("/v1/lab04/edit", { fcid: "SN_UNKNOWN", text: "x" })).status).toBe(404);
    expect((await post("/v1/lab04/edit", { fcid: doc.snTypo })).status).toBe(400);

    await post("/v1/lab04/semantic-change", { fcid: doc.snTypo, text: "Out of the tree." });
    const tree = await get("/v1/lab01/explorer/tree");
    const rootFcids = tree.body.data.roots.map((r: { fcid: string }) => r.fcid);
    expect(rootFcids).not.toContain(doc.snTypo);
  });

  it("merges SN siblings into a single sentence", async () => {
    const doc = await importDoc();
    const res = await post("/v1/lab04/merge", { fcids: [doc.snTypo, doc.snCompound] });
    expect(res.status).toBe(200);
    expect(textOf(res.body.data.fcid)).toBe("FCIDs provide persistent identty. FCIDs are persistent; FCAS is human readable.");
    expect(childrenOf(doc.pg1)).toEqual([res.body.data.fcid]);
  });

  it("reset clears lineage and evolution events", async () => {
    await resetAndSeed();
    const counts = sqliteClient
      .prepare("select (select count(*) from artifact_lineage) as lineage, (select count(*) from evolution_events) as events")
      .get() as { lineage: number; events: number };
    expect(counts).toEqual({ lineage: 0, events: 0 });
  });
});
