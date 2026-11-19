import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../api/app.js";
import { sqliteClient } from "../db/client.js";
import { resetAndSeed } from "../seeds/seed.js";

// Lab 01.5 — Chat Migration & Idempotent Import. Part A: scenarios C01–C20 from docs/lab 01.5.md.

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

type Node = { fcid: string; type: string; label: string; children: Node[] };

function row(fcid: string): { type: string; state: string; metadata_json: string | null } {
  return sqliteClient.prepare("select type, state, metadata_json from artifacts where fcid = ?").get(fcid) as {
    type: string;
    state: string;
    metadata_json: string | null;
  };
}

function children(fcid: string): string[] {
  return (
    sqliteClient
      .prepare("select child_fcid from artifact_edges where parent_fcid = ? and relation_type = 'contains' order by order_index")
      .all(fcid) as Array<{ child_fcid: string }>
  ).map((r) => r.child_fcid);
}

function tree(fcid: string): Node {
  const meta = JSON.parse(row(fcid).metadata_json ?? "{}") as Record<string, unknown>;
  return {
    fcid,
    type: row(fcid).type,
    label: String(meta.text ?? meta.title ?? ""),
    children: children(fcid).map(tree),
  };
}

/** Flat list of the labels of one type, in document order. */
function labels(root: Node, type: string): string[] {
  const out: string[] = [];
  const visit = (node: Node) => {
    if (node.type === type) out.push(node.label);
    node.children.forEach(visit);
  };
  visit(root);
  return out;
}

function find(root: Node, type: string, label: string): Node {
  let found: Node | undefined;
  const visit = (node: Node) => {
    if (!found && node.type === type && node.label === label) found = node;
    node.children.forEach(visit);
  };
  visit(root);
  if (!found) throw new Error(`${type} "${label}" not found`);
  return found;
}

function count(table: string): number {
  return (sqliteClient.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n;
}

function eventsOf(operation: string): number {
  return (sqliteClient.prepare("select count(*) as n from evolution_events where operation = ?").get(operation) as { n: number }).n;
}

function state(fcid: string): string {
  return row(fcid).state;
}

const V1 = [
  "# Receita",
  "",
  "Misture a farinha. Adicione a água.",
  "",
  "Sove por dez minutos.",
  "",
  "## Descanso",
  "",
  "Deixe descansar por uma hora.",
].join("\n");

let keyCounter = 0;

async function importV1(text = V1) {
  keyCounter += 1;
  const resourceKey = `reimport-${keyCounter}.md`;
  const first = await post("/v1/lab01/import/document", { resourceKey, title: resourceKey, text });
  expect(first.status).toBe(200);
  return { resourceKey, rootFcid: first.body.data.rootFcid as string, projectionId: first.body.data.projectionId as string };
}

async function reimport(resourceKey: string, text: string) {
  const response = await post("/v1/lab01/import/document", { resourceKey, title: resourceKey, text });
  expect(response.status).toBe(200);
  return response.body.data as { rootFcid: string; projectionId: string; reimport: Record<string, any> | null };
}

describe("reference prefix length (ADR-018, updated)", () => {
  it("R01: new references use REF_ followed by 6 characters, like the ForgeOS", async () => {
    const chat = await post("/v1/lab01/chat/create", { resourceKey: "::ref-length", title: "Ref length" });
    await post(`/v1/lab01/chat/${chat.body.data.chatFcid}/messages`, { role: "user", text: "Hello there." });
    const reference = await post("/v1/lab03/references", { sourceFcid: chat.body.data.chatFcid, fcas: "[[::ref-length<1>]]" });
    expect(reference.body.data.referenceId).toMatch(/^REF_[A-Z0-9]{6}$/);
  });
});

describe("Lab 01.5 Part A — document reimport", () => {
  it("C01: the same text changes nothing", async () => {
    const { resourceKey, rootFcid, projectionId } = await importV1();
    const before = { artifacts: count("artifacts"), edges: count("artifact_edges"), projections: count("projections"), events: count("evolution_events") };
    const snapshot = JSON.stringify(tree(rootFcid));

    const again = await reimport(resourceKey, V1);

    expect(again.rootFcid).toBe(rootFcid);
    expect(again.projectionId).toBe(projectionId);
    expect(again.reimport).toMatchObject({ edited: 0, replaced: 0, removed: 0, added: 0, moved: 0 });
    expect(again.reimport?.kept).toBeGreaterThan(0);
    expect(JSON.stringify(tree(rootFcid))).toBe(snapshot);
    expect({ artifacts: count("artifacts"), edges: count("artifact_edges"), projections: count("projections"), events: count("evolution_events") }).toEqual(before);
  });

  it("C02: a small fix in one sentence keeps the SN and records an edit", async () => {
    const { resourceKey, rootFcid } = await importV1();
    const sn = find(tree(rootFcid), "SN", "Adicione a água.");
    const edits = eventsOf("edit");

    const again = await reimport(resourceKey, V1.replace("Adicione a água.", "Adicione a agua."));

    expect(again.reimport).toMatchObject({ edited: 1, replaced: 0, removed: 0, added: 0 });
    expect(JSON.parse(row(sn.fcid).metadata_json ?? "{}").text).toBe("Adicione a agua.");
    expect(state(sn.fcid)).toBe("active");
    expect(eventsOf("edit")).toBe(edits + 1);
  });

  it("C03: a sentence with a new meaning gets a new SN that evolves from the old one", async () => {
    const { resourceKey, rootFcid } = await importV1();
    const old = find(tree(rootFcid), "SN", "Sove por dez minutos.");

    const again = await reimport(resourceKey, V1.replace("Sove por dez minutos.", "Leve a massa à geladeira até amanhã."));

    expect(again.reimport).toMatchObject({ edited: 0, replaced: 1, removed: 0, added: 0 });
    expect(state(old.fcid)).toBe("superseded");
    const fresh = find(tree(rootFcid), "SN", "Leve a massa à geladeira até amanhã.");
    const lineage = sqliteClient
      .prepare("select ancestor_fcid, relation_type from artifact_lineage where descendant_fcid = ?")
      .get(fresh.fcid) as { ancestor_fcid: string; relation_type: string };
    expect(lineage).toEqual({ ancestor_fcid: old.fcid, relation_type: "evolves_from" });
    expect(labels(tree(rootFcid), "SN")).not.toContain("Sove por dez minutos.");
  });

  it("C04: a new paragraph in the middle is created and the neighbours keep their FCIDs", async () => {
    const { resourceKey, rootFcid } = await importV1();
    const first = find(tree(rootFcid), "SN", "Misture a farinha.");
    const second = find(tree(rootFcid), "SN", "Sove por dez minutos.");

    const again = await reimport(
      resourceKey,
      V1.replace("Sove por dez minutos.", "Acrescente o sal.\n\nSove por dez minutos."),
    );

    expect(again.reimport).toMatchObject({ edited: 0, replaced: 0, removed: 0, added: 1 });
    const after = tree(rootFcid);
    expect(find(after, "SN", "Misture a farinha.").fcid).toBe(first.fcid);
    expect(find(after, "SN", "Sove por dez minutos.").fcid).toBe(second.fcid);
    expect(labels(after, "SN")).toEqual([
      "Misture a farinha.",
      "Adicione a água.",
      "Acrescente o sal.",
      "Sove por dez minutos.",
      "Deixe descansar por uma hora.",
    ]);
  });

  it("C05: a removed paragraph is superseded with a remove event", async () => {
    const { resourceKey, rootFcid } = await importV1();
    const sn = find(tree(rootFcid), "SN", "Sove por dez minutos.");
    const removes = eventsOf("remove");

    const again = await reimport(resourceKey, V1.replace("Sove por dez minutos.\n\n", ""));

    expect(again.reimport).toMatchObject({ removed: 1, added: 0, replaced: 0 });
    expect(state(sn.fcid)).toBe("superseded");
    expect(labels(tree(rootFcid), "SN")).not.toContain("Sove por dez minutos.");
    expect(eventsOf("remove")).toBe(removes + 1);
  });

  it("C06: a renamed section keeps its SS and updates the title", async () => {
    const { resourceKey, rootFcid } = await importV1();
    const ss = find(tree(rootFcid), "SS", "Descanso");
    const inner = find(tree(rootFcid), "SN", "Deixe descansar por uma hora.");

    const again = await reimport(resourceKey, V1.replace("## Descanso", "## Repouso"));

    expect(again.reimport).toMatchObject({ edited: 1, replaced: 0, removed: 0, added: 0 });
    expect(JSON.parse(row(ss.fcid).metadata_json ?? "{}").title).toBe("Repouso");
    expect(find(tree(rootFcid), "SN", "Deixe descansar por uma hora.").fcid).toBe(inner.fcid);
  });

  it("C07: sections in a new order keep their FCIDs and get a new order", async () => {
    const text = ["# Alfa", "", "Texto da alfa.", "", "# Beta", "", "Texto da beta."].join("\n");
    const { resourceKey, rootFcid } = await importV1(text);
    const alfa = find(tree(rootFcid), "SS", "Alfa");
    const beta = find(tree(rootFcid), "SS", "Beta");

    const swapped = ["# Beta", "", "Texto da beta.", "", "# Alfa", "", "Texto da alfa."].join("\n");
    const again = await reimport(resourceKey, swapped);

    expect(again.reimport).toMatchObject({ edited: 0, replaced: 0, removed: 0, added: 0, moved: 1 });
    expect(children(rootFcid)).toEqual([beta.fcid, alfa.fcid]);
    expect(state(alfa.fcid)).toBe("active");
    expect(state(beta.fcid)).toBe("active");
  });

  it("C08: a document without headings does not duplicate its PG and SN", async () => {
    const text = "Primeira frase. Segunda frase.\n\nTerceira frase.";
    const { resourceKey, rootFcid } = await importV1(text);
    const snapshot = JSON.stringify(tree(rootFcid));
    const artifacts = count("artifacts");

    const again = await reimport(resourceKey, text);

    expect(again.reimport).toMatchObject({ edited: 0, replaced: 0, removed: 0, added: 0 });
    expect(JSON.stringify(tree(rootFcid))).toBe(snapshot);
    expect(count("artifacts")).toBe(artifacts);
  });

  it("C09: text before the first heading does not duplicate either", async () => {
    const text = ["Texto antes do título.", "", "# Título", "", "Corpo."].join("\n");
    const { resourceKey, rootFcid } = await importV1(text);
    const snapshot = JSON.stringify(tree(rootFcid));

    const again = await reimport(resourceKey, text);

    expect(again.reimport).toMatchObject({ edited: 0, replaced: 0, removed: 0, added: 0 });
    expect(JSON.stringify(tree(rootFcid))).toBe(snapshot);
  });

  it("C10: removing the projection and importing again reuses the DC and reactivates the projection", async () => {
    const { resourceKey, rootFcid, projectionId } = await importV1();
    await post("/v1/lab01/projection/remove", { projectionId });

    const bindings = sqliteClient.prepare("select count(*) as n from resource_bindings where resource_key = ?").get(resourceKey) as { n: number };
    expect(bindings.n).toBe(1);
    // While it is removed the name does not resolve.
    expect((await post("/v1/lab03/resolve", { fcas: `[[${resourceKey}]]` })).status).toBe(404);

    const again = await reimport(resourceKey, V1);

    expect(again.rootFcid).toBe(rootFcid);
    expect(again.projectionId).toBe(projectionId);
    expect(sqliteClient.prepare("select status from projections where projection_id = ?").get(projectionId)).toEqual({ status: "active" });
    expect((await post("/v1/lab03/resolve", { fcas: `[[${resourceKey}]]` })).body.data.targetFcid).toBe(rootFcid);
    expect(again.reimport).toMatchObject({ edited: 0, replaced: 0, removed: 0, added: 0 });
  });

  it("C11: a failure in the middle leaves nothing written", async () => {
    const { resourceKey, rootFcid } = await importV1();
    const snapshot = JSON.stringify(tree(rootFcid));
    const counts = { artifacts: count("artifacts"), edges: count("artifact_edges"), events: count("evolution_events"), lineage: count("artifact_lineage") };

    // The summary event is the last write of a reimport; making it fail must undo everything before it.
    sqliteClient.exec(
      "create trigger lab015_boom before insert on evolution_events when new.operation = 'reimport' begin select raise(abort, 'boom'); end;",
    );
    try {
      const changed = V1.replace("Sove por dez minutos.", "Leve a massa à geladeira até amanhã.").replace("Adicione a água.", "Adicione a agua.");
      const failed = await post("/v1/lab01/import/document", { resourceKey, title: resourceKey, text: changed });
      expect(failed.status).toBe(500);
    } finally {
      sqliteClient.exec("drop trigger lab015_boom");
    }

    expect(JSON.stringify(tree(rootFcid))).toBe(snapshot);
    expect({ artifacts: count("artifacts"), edges: count("artifact_edges"), events: count("evolution_events"), lineage: count("artifact_lineage") }).toEqual(counts);
  });

  it("C12: a reference to an element that stayed is still resolved", async () => {
    const { resourceKey, rootFcid } = await importV1();
    const sn = find(tree(rootFcid), "SN", "Misture a farinha.");
    const reference = await post("/v1/lab03/references", { sourceFcid: rootFcid, fcas: `[[${sn.fcid}]]` });

    await reimport(resourceKey, V1.replace("Sove por dez minutos.", "Acrescente o sal.\n\nSove por dez minutos."));

    const continuity = await get(`/v1/lab04/references/${reference.body.data.referenceId}`);
    expect(continuity.body.data).toMatchObject({ targetFcid: sn.fcid, status: "resolved" });
  });

  it("C13: a reference to a removed element becomes ORPHANED with remove as the cause", async () => {
    const { resourceKey, rootFcid } = await importV1();
    const sn = find(tree(rootFcid), "SN", "Sove por dez minutos.");
    const reference = await post("/v1/lab03/references", { sourceFcid: rootFcid, fcas: `[[${sn.fcid}]]` });

    await reimport(resourceKey, V1.replace("Sove por dez minutos.\n\n", ""));

    const continuity = await get(`/v1/lab04/references/${reference.body.data.referenceId}`);
    expect(continuity.body.data).toMatchObject({ status: "orphaned", currentFcids: [] });
    const expanded = await post("/v1/lab05/expand", { text: `Veja [[${sn.fcid}]].` });
    expect(expanded.body.data.warnings[0]).toMatchObject({ code: "ORPHANED", cause: { operation: "remove" } });
  });

  it("C14: two different keys do not affect each other", async () => {
    const a = await importV1();
    const b = await importV1("# Outro\n\nOutro texto.");
    const snapshotB = JSON.stringify(tree(b.rootFcid));

    await reimport(a.resourceKey, V1.replace("Sove por dez minutos.", "Leve a massa à geladeira até amanhã."));

    expect(JSON.stringify(tree(b.rootFcid))).toBe(snapshotB);
    expect(b.rootFcid).not.toBe(a.rootFcid);
  });

  it("C15: importing a directory again keeps the FCID of each document and does not duplicate the directory", async () => {
    keyCounter += 1;
    const documents = [
      { resourceKey: `dir-${keyCounter}/a.md`, title: "A", text: "# A\n\nTexto A." },
      { resourceKey: `dir-${keyCounter}/b.md`, title: "B", text: "# B\n\nTexto B." },
    ];
    const first = await post("/v1/lab01/import/directory", { title: `Pasta ${keyCounter}`, documents });
    const drCount = (sqliteClient.prepare("select count(*) as n from artifacts where type = 'DR'").get() as { n: number }).n;
    const artifacts = count("artifacts");

    const second = await post("/v1/lab01/import/directory", { title: `Pasta ${keyCounter}`, documents });

    expect(second.body.data.directoryFcid).toBe(first.body.data.directoryFcid);
    expect(second.body.data.documents.map((d: any) => d.rootFcid)).toEqual(first.body.data.documents.map((d: any) => d.rootFcid));
    expect((sqliteClient.prepare("select count(*) as n from artifacts where type = 'DR'").get() as { n: number }).n).toBe(drCount);
    expect(count("artifacts")).toBe(artifacts);
    // Each document has exactly one structural parent.
    for (const doc of first.body.data.documents) {
      const parents = sqliteClient.prepare("select count(*) as n from artifact_edges where child_fcid = ? and relation_type = 'contains'").get(doc.rootFcid) as { n: number };
      expect(parents.n).toBe(1);
    }
  });

  it("C15c: a reimport keeps the parent unless a parent is given, and then it moves the document", async () => {
    const { resourceKey, rootFcid } = await importV1();
    const parentOf = () =>
      sqliteClient.prepare("select parent_fcid from artifact_edges where child_fcid = ? and relation_type = 'contains'").all(rootFcid);
    expect(parentOf()).toEqual([{ parent_fcid: "WS_MAIN" }]);

    await post("/v1/lab01/import/document", { resourceKey, title: resourceKey, text: V1, parentFcid: "PJ_CORE" });
    expect(parentOf()).toEqual([{ parent_fcid: "PJ_CORE" }]);

    // Without a parent the document stays where it is, instead of going back to the workspace.
    await reimport(resourceKey, V1);
    expect(parentOf()).toEqual([{ parent_fcid: "PJ_CORE" }]);
  });

  it("C15b: a first import has no reimport summary", async () => {
    keyCounter += 1;
    const first = await post("/v1/lab01/import/document", { resourceKey: `fresh-${keyCounter}.md`, title: "Fresh", text: V1 });
    expect(first.body.data.reimport).toBeNull();
  });
});

async function importChat(resourceKey: string, messages: Array<{ role: string; text: string }>) {
  const response = await post("/v1/lab01/chat/import", { resourceKey, title: resourceKey, messages });
  expect(response.status).toBe(200);
  return response.body.data as { chatFcid: string; projectionId: string; messageFcids: string[]; reimport: Record<string, any> | null };
}

const CONVERSATION = [
  { role: "user", text: "Como começo a assar pão?" },
  { role: "assistant", text: "Comece pela massa. Use farinha, água, sal e fermento." },
  { role: "user", text: "E depois?" },
];

describe("Lab 01.5 Part A — chat reimport", () => {
  it("C16: the same conversation changes nothing", async () => {
    const first = await importChat("::chat-same", CONVERSATION);
    expect(first.reimport).toBeNull();
    const snapshot = JSON.stringify(tree(first.chatFcid));
    const counts = { artifacts: count("artifacts"), events: count("evolution_events"), projections: count("projections") };

    const again = await importChat("::chat-same", CONVERSATION);

    expect(again.chatFcid).toBe(first.chatFcid);
    expect(again.projectionId).toBe(first.projectionId);
    expect(again.messageFcids).toEqual(first.messageFcids);
    expect(again.reimport).toMatchObject({ edited: 0, replaced: 0, removed: 0, added: 0 });
    expect(JSON.stringify(tree(first.chatFcid))).toBe(snapshot);
    expect({ artifacts: count("artifacts"), events: count("evolution_events"), projections: count("projections") }).toEqual(counts);
  });

  it("C16b: an imported chat hangs from the workspace and is created once", async () => {
    const first = await importChat("::chat-parent", CONVERSATION);
    await importChat("::chat-parent", CONVERSATION);
    const parents = sqliteClient.prepare("select parent_fcid from artifact_edges where child_fcid = ? and relation_type = 'contains'").all(first.chatFcid);
    expect(parents).toEqual([{ parent_fcid: "WS_MAIN" }]);
  });

  it("C17: new messages at the end add only those", async () => {
    const first = await importChat("::chat-append", CONVERSATION);

    const again = await importChat("::chat-append", [
      ...CONVERSATION,
      { role: "assistant", text: "Sove a massa e deixe descansar." },
      { role: "user", text: "Quanto tempo?" },
    ]);

    expect(again.messageFcids.slice(0, 3)).toEqual(first.messageFcids);
    expect(again.messageFcids).toHaveLength(5);
    expect(again.reimport).toMatchObject({ edited: 0, replaced: 0, removed: 0, added: 2 });
    expect(children(first.chatFcid)).toEqual(again.messageFcids);
  });

  it("C18: an altered message keeps its MS and updates the content", async () => {
    const first = await importChat("::chat-alter", CONVERSATION);
    const msFcid = first.messageFcids[1];
    const oldSn = children(children(msFcid)[0])[0];

    const again = await importChat("::chat-alter", [
      CONVERSATION[0],
      { role: "assistant", text: "Misture tudo, deixe crescer em lugar morno e asse em forno bem quente." },
      CONVERSATION[2],
    ]);

    expect(again.messageFcids).toEqual(first.messageFcids);
    expect(again.reimport?.replaced).toBeGreaterThanOrEqual(1);
    expect(state(msFcid)).toBe("active");
    expect(state(oldSn)).toBe("superseded");
    const projected = await post("/v1/lab02/project", { artifactFcid: first.chatFcid, targetFormat: "markdown" });
    expect(projected.body.data.content).toContain("lugar morno");
    expect(projected.body.data.content).not.toContain("Use farinha, água, sal e fermento.");
  });

  it("C18b: a message whose role changed at the same position is replaced, not edited", async () => {
    const first = await importChat("::chat-role", CONVERSATION);
    const old = first.messageFcids[2];

    const again = await importChat("::chat-role", [CONVERSATION[0], CONVERSATION[1], { role: "assistant", text: "E depois?" }]);

    expect(again.messageFcids.slice(0, 2)).toEqual(first.messageFcids.slice(0, 2));
    expect(again.messageFcids[2]).not.toBe(old);
    expect(state(old)).toBe("superseded");
    expect(again.reimport).toMatchObject({ removed: 1, added: 1 });
  });

  it("C19: a message that disappeared is superseded", async () => {
    const first = await importChat("::chat-drop", CONVERSATION);
    const removes = eventsOf("remove");

    const again = await importChat("::chat-drop", CONVERSATION.slice(0, 2));

    expect(again.messageFcids).toEqual(first.messageFcids.slice(0, 2));
    expect(again.reimport).toMatchObject({ removed: 1, added: 0 });
    expect(state(first.messageFcids[2])).toBe("superseded");
    expect(children(first.chatFcid)).toEqual(first.messageFcids.slice(0, 2));
    expect(eventsOf("remove")).toBe(removes + 1);
  });

  it("C20: <N> keeps pointing at the same message after messages are appended", async () => {
    const first = await importChat("::chat-index", CONVERSATION);
    const before = await post("/v1/lab03/resolve", { fcas: "[[::chat-index<2>]]" });
    expect(before.body.data.targetFcid).toBe(first.messageFcids[1]);

    await importChat("::chat-index", [...CONVERSATION, { role: "assistant", text: "Depois, sove a massa." }]);

    const after = await post("/v1/lab03/resolve", { fcas: "[[::chat-index<2>]]" });
    expect(after.body.data.targetFcid).toBe(first.messageFcids[1]);
  });
});
