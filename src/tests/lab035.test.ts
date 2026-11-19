import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../api/app.js";
import { sqliteClient } from "../db/client.js";
import { resetAndSeed } from "../seeds/seed.js";

// Lab 03.5 — Reference Stability. Scenarios S01–S18 (rename, move, reorganize) and the reference states.
// Rules: docs/lab 03.md (Sub-Lab 03.5), ADR-024.

const app = buildApp();

beforeAll(async () => {
  await resetAndSeed();
});

afterAll(async () => {
  await app.close();
});

async function post(url: string, payload: unknown) {
  const response = await app.inject({ method: "POST", url, payload: payload as Record<string, unknown> });
  return { status: response.statusCode, body: response.json() as Record<string, any> };
}

async function get(url: string) {
  const response = await app.inject({ method: "GET", url });
  return { status: response.statusCode, body: response.json() as Record<string, any> };
}

const resolve = (fcas: string) => post("/v1/lab03/resolve", { fcas });

function children(fcid: string): string[] {
  return (
    sqliteClient
      .prepare("select child_fcid from artifact_edges where parent_fcid = ? and relation_type = 'contains' order by order_index")
      .all(fcid) as Array<{ child_fcid: string }>
  ).map((r) => r.child_fcid);
}

function parentsOf(fcid: string): string[] {
  return (
    sqliteClient.prepare("select parent_fcid from artifact_edges where child_fcid = ? and relation_type = 'contains'").all(fcid) as Array<{
      parent_fcid: string;
    }>
  ).map((r) => r.parent_fcid);
}

function storedStatus(referenceId: string): string {
  return (sqliteClient.prepare('select status from "references" where reference_id = ?').get(referenceId) as { status: string }).status;
}

function snapshot(fcid: string): unknown {
  const row = sqliteClient.prepare("select type, state, metadata_json from artifacts where fcid = ?").get(fcid);
  return { row, children: children(fcid).map(snapshot) };
}

const TEXT = ["# Introduction", "", "FCID is persistent identity.", "", "# Scope", "", "Document is a projection."].join("\n");

async function importDoc(resourceKey: string, text = TEXT, parentFcid?: string) {
  const response = await post("/v1/lab01/import/document", { resourceKey, title: resourceKey, text, ...(parentFcid ? { parentFcid } : {}) });
  expect(response.status).toBe(200);
  const rootFcid = response.body.data.rootFcid as string;
  return { rootFcid, projectionId: response.body.data.projectionId as string, intro: children(rootFcid)[0], scope: children(rootFcid)[1] };
}

async function importDir(title: string, documents: Array<{ resourceKey: string }>, parentFcid?: string) {
  const response = await post("/v1/lab01/import/directory", {
    title,
    ...(parentFcid ? { parentFcid } : {}),
    documents: documents.map((d) => ({ resourceKey: d.resourceKey, title: d.resourceKey, text: TEXT })),
  });
  expect(response.status).toBe(200);
  return {
    directoryFcid: response.body.data.directoryFcid as string,
    documents: response.body.data.documents.map((d: any) => d.rootFcid as string),
  };
}

async function reference(sourceFcid: string, fcas: string) {
  const response = await post("/v1/lab03/references", { sourceFcid, fcas });
  expect(response.status).toBe(200);
  return response.body.data.referenceId as string;
}

describe("Lab 03.5 — rename", () => {
  it("S01: renaming a document keeps the reference valid; the old name goes stale and refresh fixes it", async () => {
    const d = await importDoc("architecture.md");
    const ref = await reference(d.rootFcid, "[[architecture.md#Introduction]]");
    expect((await get(`/v1/lab03/references/${ref}`)).body.data.status).toBe("resolved");

    const renamed = await post("/v1/lab03/rename", { fcid: d.rootFcid, resourceKey: "core-architecture.md" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data).toMatchObject({ fcid: d.rootFcid, previous: "architecture.md", current: "core-architecture.md" });

    // The FCID did not change; the new name resolves to it, the old one no longer does.
    expect((await resolve("[[architecture.md]]")).status).toBe(404);
    expect((await resolve("[[core-architecture.md]]")).body.data.targetFcid).toBe(d.rootFcid);
    expect((await resolve("[[core-architecture.md#Introduction]]")).body.data.targetFcid).toBe(d.intro);

    // The reference still points at the same artifact; only its stored text is out of date.
    const status = await get(`/v1/lab03/references/${ref}`);
    expect(status.body.data).toMatchObject({
      referenceId: ref,
      targetFcid: d.intro,
      status: "stale",
      canonicalFcas: "[[core-architecture.md#Introduction]]",
    });

    const refreshed = await post(`/v1/lab03/references/${ref}/refresh`, {});
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data).toMatchObject({ status: "resolved", fcasRaw: "[[core-architecture.md#Introduction]]", targetFcid: d.intro });
    expect((await resolve(refreshed.body.data.fcasRaw)).body.data.targetFcid).toBe(d.intro);
  });

  it("S02: a name that is already taken is refused and nothing changes", async () => {
    const a = await importDoc("s02-a.md");
    await importDoc("s02-b.md");

    const refused = await post("/v1/lab03/rename", { fcid: a.rootFcid, resourceKey: "s02-b.md" });

    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("CONFLICT");
    expect((await resolve("[[s02-a.md]]")).body.data.targetFcid).toBe(a.rootFcid);
  });

  it("S03: a name that cannot be addressed is refused", async () => {
    const d = await importDoc("s03.md");
    expect((await post("/v1/lab03/rename", { fcid: d.rootFcid, resourceKey: "s03.txt" })).status).toBe(422);
    expect((await post("/v1/lab03/rename", { fcid: d.rootFcid, resourceKey: "a#b.md" })).status).toBe(422);
    expect((await post("/v1/lab03/rename", { fcid: d.intro, resourceKey: "x.md" })).status).toBe(422);
    expect((await post("/v1/lab03/rename", { fcid: "DC_NOPE00", resourceKey: "x.md" })).status).toBe(404);
  });

  it("S04: renaming changes no structure, content or FCID, and the projection follows", async () => {
    const d = await importDoc("s04.md");
    const before = JSON.stringify(snapshot(d.rootFcid));

    await post("/v1/lab03/rename", { fcid: d.rootFcid, resourceKey: "s04-renamed.md", title: "Renamed title" });

    const after = JSON.parse(JSON.stringify(snapshot(d.rootFcid))) as { row: { metadata_json: string } };
    // Only the resource key inside the root metadata changes.
    expect(JSON.parse(after.row.metadata_json).resourceKey).toBe("s04-renamed.md");
    expect(JSON.stringify({ ...(after as object), row: undefined })).toBe(JSON.stringify({ ...(JSON.parse(before) as object), row: undefined }));
    const projection = sqliteClient.prepare("select source_ref, metadata_json from projections where projection_id = ?").get(d.projectionId) as {
      source_ref: string;
      metadata_json: string;
    };
    expect(projection.source_ref).toBe("s04-renamed.md");
    expect(JSON.parse(projection.metadata_json).title).toBe("Renamed title");
  });

  it("S05: a reference written with the FCID is not affected by a rename", async () => {
    const d = await importDoc("s05.md");
    const ref = await reference(d.rootFcid, `[[${d.intro}]]`);

    await post("/v1/lab03/rename", { fcid: d.rootFcid, resourceKey: "s05-renamed.md" });

    expect((await get(`/v1/lab03/references/${ref}`)).body.data).toMatchObject({ status: "resolved", targetFcid: d.intro });
  });

  it("S06: renaming a chat keeps a message reference valid and makes its text stale", async () => {
    const chat = await post("/v1/lab01/chat/import", {
      resourceKey: "::s06-old",
      title: "S06",
      messages: [
        { role: "user", text: "First question." },
        { role: "assistant", text: "First answer." },
      ],
    });
    const chatFcid = chat.body.data.chatFcid as string;
    const second = chat.body.data.messageFcids[1] as string;
    const ref = await reference(chatFcid, "[[::s06-old<2>]]");

    expect((await post("/v1/lab03/rename", { fcid: chatFcid, resourceKey: "no-prefix" })).status).toBe(422);
    expect((await post("/v1/lab03/rename", { fcid: chatFcid, resourceKey: "::s06-new" })).status).toBe(200);

    expect((await resolve("[[::s06-old<2>]]")).status).toBe(404);
    expect((await resolve("[[::s06-new<2>]]")).body.data.targetFcid).toBe(second);
    expect((await get(`/v1/lab03/references/${ref}`)).body.data).toMatchObject({ status: "stale", targetFcid: second, canonicalFcas: "[[::s06-new<2>]]" });
  });

  it("S07: renaming a directory keeps a reference to it valid and makes its text stale", async () => {
    const dir = await importDir("Dir S07", [{ resourceKey: "s07/a.md" }]);
    const ref = await reference(dir.documents[0], "[[Dir S07]]");

    expect((await post("/v1/lab03/rename", { fcid: dir.directoryFcid, title: "Dir S07 renamed" })).status).toBe(200);

    expect((await get(`/v1/lab03/references/${ref}`)).body.data).toMatchObject({
      status: "stale",
      targetFcid: dir.directoryFcid,
      canonicalFcas: "[[Dir S07 renamed]]",
    });
    expect((await post(`/v1/lab03/references/${ref}/refresh`, {})).body.data.status).toBe("resolved");
  });

  it("S08: a name that two directories share makes the text stale, and the FCID stays the safe address", async () => {
    const first = await importDir("Twin", [{ resourceKey: "s08/a.md" }]);
    const second = await importDir("Twin elsewhere", [{ resourceKey: "s08/b.md" }]);
    const ref = await reference(first.documents[0], "[[Twin]]");
    expect((await get(`/v1/lab03/references/${ref}`)).body.data.status).toBe("resolved");

    await post("/v1/lab03/rename", { fcid: second.directoryFcid, title: "Twin" });

    const status = await get(`/v1/lab03/references/${ref}`);
    expect(status.body.data).toMatchObject({ status: "stale", targetFcid: first.directoryFcid, canonicalFcas: `[[${first.directoryFcid}]]` });
    const refreshed = await post(`/v1/lab03/references/${ref}/refresh`, {});
    expect(refreshed.body.data).toMatchObject({ status: "resolved", fcasRaw: `[[${first.directoryFcid}]]` });
  });

  it("S09: the stored status follows the structure", async () => {
    const d = await importDoc("s09.md");
    const ref = await reference(d.rootFcid, "[[s09.md#Scope]]");
    expect(storedStatus(ref)).toBe("resolved");

    await post("/v1/lab03/rename", { fcid: d.rootFcid, resourceKey: "s09-renamed.md" });
    expect(storedStatus(ref)).toBe("stale");

    await post(`/v1/lab03/references/${ref}/refresh`, {});
    expect(storedStatus(ref)).toBe("resolved");
  });
});

describe("Lab 03.5 — move", () => {
  it("S10: moving a directory keeps the references to its documents valid, with the same text", async () => {
    const dir = await importDir("Dir S10", [{ resourceKey: "s10/a.md" }, { resourceKey: "s10/b.md" }]);
    const byName = await reference(dir.documents[0], "[[s10/a.md#Introduction]]");
    const toDir = await reference(dir.documents[1], "[[Dir S10]]");
    expect(parentsOf(dir.directoryFcid)).toEqual(["WS_MAIN"]);

    const moved = await post("/v1/lab03/move", { fcid: dir.directoryFcid, newParentFcid: "PJ_CORE" });

    expect(moved.status).toBe(200);
    expect(moved.body.data).toMatchObject({ fcid: dir.directoryFcid, previousParent: "WS_MAIN", newParent: "PJ_CORE" });
    expect(parentsOf(dir.directoryFcid)).toEqual(["PJ_CORE"]);
    expect(children(dir.directoryFcid)).toEqual(dir.documents);
    expect((await get(`/v1/lab03/references/${byName}`)).body.data.status).toBe("resolved");
    expect((await get(`/v1/lab03/references/${toDir}`)).body.data).toMatchObject({ status: "resolved", targetFcid: dir.directoryFcid });
    expect((await resolve("[[Dir S10]]")).body.data.targetFcid).toBe(dir.directoryFcid);
  });

  it("S11: moving a document to another directory keeps it addressable by the same name", async () => {
    const from = await importDir("Dir S11 from", [{ resourceKey: "s11/a.md" }]);
    const to = await importDir("Dir S11 to", [{ resourceKey: "s11/b.md" }]);
    const ref = await reference(from.documents[0], "[[s11/a.md#Scope]]");

    await post("/v1/lab03/move", { fcid: from.documents[0], newParentFcid: to.directoryFcid });

    expect(parentsOf(from.documents[0])).toEqual([to.directoryFcid]);
    expect(children(from.directoryFcid)).toEqual([]);
    expect(children(to.directoryFcid)).toContain(from.documents[0]);
    expect((await get(`/v1/lab03/references/${ref}`)).body.data.status).toBe("resolved");
  });

  it("S12: a move into itself or into its own descendant is refused", async () => {
    const outer = await importDir("Dir S12 outer", [{ resourceKey: "s12/a.md" }]);
    const inner = await importDir("Dir S12 inner", [{ resourceKey: "s12/b.md" }], outer.directoryFcid);
    const before = parentsOf(outer.directoryFcid);

    const self = await post("/v1/lab03/move", { fcid: outer.directoryFcid, newParentFcid: outer.directoryFcid });
    const nested = await post("/v1/lab03/move", { fcid: outer.directoryFcid, newParentFcid: inner.directoryFcid });

    expect(self.status).toBe(409);
    expect(nested.status).toBe(409);
    expect(nested.body.code).toBe("CYCLE");
    expect(parentsOf(outer.directoryFcid)).toEqual(before);
  });

  it("S13: only a directory or a document can move, and only to the workspace, a project or a directory", async () => {
    const d = await importDoc("s13.md");
    expect((await post("/v1/lab03/move", { fcid: d.intro, newParentFcid: "PJ_CORE" })).status).toBe(422);
    expect((await post("/v1/lab03/move", { fcid: d.rootFcid, newParentFcid: d.scope })).status).toBe(422);
    expect((await post("/v1/lab03/move", { fcid: d.rootFcid, newParentFcid: "DR_NOPE00" })).status).toBe(404);
    expect((await post("/v1/lab03/move", { fcid: "DC_NOPE00", newParentFcid: "PJ_CORE" })).status).toBe(404);
    expect(parentsOf(d.rootFcid)).toEqual(["WS_MAIN"]);
  });
});

describe("Lab 03.5 — reorganize", () => {
  it("S14: reordering the sections of a document keeps every reference valid", async () => {
    const d = await importDoc("s14.md");
    const byName = await reference(d.rootFcid, "[[s14.md#Scope]]");
    const byFcid = await reference(d.rootFcid, `[[${d.intro}]]`);

    const reordered = await post("/v1/lab03/reorder", { parentFcid: d.rootFcid, childFcids: [d.scope, d.intro] });

    expect(reordered.status).toBe(200);
    expect(children(d.rootFcid)).toEqual([d.scope, d.intro]);
    expect((await get(`/v1/lab03/references/${byName}`)).body.data).toMatchObject({ status: "resolved", targetFcid: d.scope });
    expect((await get(`/v1/lab03/references/${byFcid}`)).body.data).toMatchObject({ status: "resolved", targetFcid: d.intro });
    const projected = await post("/v1/lab02/project", { artifactFcid: d.rootFcid, targetFormat: "markdown" });
    const content = projected.body.data.content as string;
    expect(content.indexOf("# Scope")).toBeLessThan(content.indexOf("# Introduction"));
  });

  it("S15: reordering the messages of a chat keeps the target but makes the positional text stale", async () => {
    const chat = await post("/v1/lab01/chat/import", {
      resourceKey: "::s15",
      title: "S15",
      messages: [
        { role: "user", text: "One." },
        { role: "assistant", text: "Two." },
        { role: "user", text: "Three." },
      ],
    });
    const chatFcid = chat.body.data.chatFcid as string;
    const [m1, m2, m3] = chat.body.data.messageFcids as string[];
    const ref = await reference(chatFcid, "[[::s15<2>]]");

    await post("/v1/lab03/reorder", { parentFcid: chatFcid, childFcids: [m1, m3, m2] });

    // The message is the same; `<2>` now points at another one.
    expect((await resolve("[[::s15<2>]]")).body.data.targetFcid).toBe(m3);
    const status = await get(`/v1/lab03/references/${ref}`);
    expect(status.body.data).toMatchObject({ status: "stale", targetFcid: m2, canonicalFcas: "[[::s15<3>]]" });

    const refreshed = await post(`/v1/lab03/references/${ref}/refresh`, {});
    expect(refreshed.body.data).toMatchObject({ status: "resolved", fcasRaw: "[[::s15<3>]]" });
    expect((await resolve("[[::s15<3>]]")).body.data.targetFcid).toBe(m2);
  });

  it("S16: reordering the documents of a directory keeps their references valid", async () => {
    const dir = await importDir("Dir S16", [{ resourceKey: "s16/a.md" }, { resourceKey: "s16/b.md" }]);
    const ref = await reference(dir.documents[0], "[[s16/a.md]]");

    await post("/v1/lab03/reorder", { parentFcid: dir.directoryFcid, childFcids: [dir.documents[1], dir.documents[0]] });

    expect(children(dir.directoryFcid)).toEqual([dir.documents[1], dir.documents[0]]);
    expect((await get(`/v1/lab03/references/${ref}`)).body.data.status).toBe("resolved");
  });

  it("S17: a list that is not a permutation of the children is refused and nothing changes", async () => {
    const d = await importDoc("s17.md");
    const bad = [
      { parentFcid: d.rootFcid, childFcids: [d.intro] },
      { parentFcid: d.rootFcid, childFcids: [d.intro, d.intro] },
      { parentFcid: d.rootFcid, childFcids: [d.intro, d.scope, "SS_NOPE00"] },
    ];
    for (const payload of bad) {
      const refused = await post("/v1/lab03/reorder", payload);
      expect(refused.status).toBe(422);
      expect(refused.body.code).toBe("NOT_A_PERMUTATION");
    }
    expect((await post("/v1/lab03/reorder", { parentFcid: "DC_NOPE00", childFcids: [] })).status).toBe(404);
    expect(children(d.rootFcid)).toEqual([d.intro, d.scope]);
  });
});

describe("Lab 03.5 — reference states", () => {
  it("S18: a reference to a sentence that evolved is reported as evolved, with the new FCID", async () => {
    const d = await importDoc("s18.md", "# Part\n\nOriginal sentence here.");
    const sn = children(children(children(d.rootFcid)[0])[0])[0];
    const ref = await reference(d.rootFcid, `[[${sn}]]`);

    const changed = await post("/v1/lab04/semantic-change", { fcid: sn, text: "A completely different statement." });
    const status = await get(`/v1/lab03/references/${ref}`);

    expect(status.body.data).toMatchObject({
      status: "evolved",
      targetFcid: sn,
      currentFcids: [changed.body.data.fcid],
      canonicalFcas: `[[${changed.body.data.fcid}]]`,
    });
  });

  it("S19: a reference into content that was replaced without a successor is reported as orphaned", async () => {
    const chat = await post("/v1/lab01/chat/import", { resourceKey: "::s19", title: "S19", messages: [{ role: "user", text: "Q." }, { role: "assistant", text: "Stale answer." }] });
    const ms = chat.body.data.messageFcids[1] as string;
    const sn = children(children(ms)[0])[0];
    const ref = await reference(chat.body.data.chatFcid, `[[${sn}]]`);

    await post("/v1/lab04/regenerate", { fcid: ms, text: "Fresh answer." });

    expect((await get(`/v1/lab03/references/${ref}`)).body.data).toMatchObject({ status: "orphaned", currentFcids: [] });
  });

  it("S20: refreshing is only for a reference whose target is active", async () => {
    const chat = await post("/v1/lab01/chat/import", { resourceKey: "::s20", title: "S20", messages: [{ role: "user", text: "Q." }, { role: "assistant", text: "Old one." }] });
    const ms = chat.body.data.messageFcids[1] as string;
    const sn = children(children(ms)[0])[0];
    const ref = await reference(chat.body.data.chatFcid, `[[${sn}]]`);
    await post("/v1/lab04/regenerate", { fcid: ms, text: "New one." });

    const refused = await post(`/v1/lab03/references/${ref}/refresh`, {});
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("TARGET_NOT_ACTIVE");
    expect((await post("/v1/lab03/references/REF_NOPE00/refresh", {})).status).toBe(404);
    expect((await get("/v1/lab03/references/REF_NOPE00")).status).toBe(404);
  });
});
