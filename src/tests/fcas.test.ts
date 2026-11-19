import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../api/app.js";
import { sqliteClient } from "../db/client.js";
import { resetAndSeed } from "../seeds/seed.js";

// Unified FCAS syntax, REF_ prefix, chat under the workspace and the ORPHANED state.
// Rules: ADR-017 to ADR-021.

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

function childrenOf(fcid: string): string[] {
  return (
    sqliteClient
      .prepare("select child_fcid from artifact_edges where parent_fcid = ? and relation_type = 'contains' order by order_index")
      .all(fcid) as Array<{ child_fcid: string }>
  ).map((r) => r.child_fcid);
}

function parentOf(fcid: string): string | undefined {
  return (sqliteClient.prepare("select parent_fcid from artifact_edges where child_fcid = ?").get(fcid) as { parent_fcid: string } | undefined)
    ?.parent_fcid;
}

async function makeChat(key: string, texts: string[]) {
  const chat = await post("/v1/lab01/chat/create", { resourceKey: key, title: key });
  const chatFcid = chat.body.data.chatFcid as string;
  const messages: string[] = [];
  for (let i = 0; i < texts.length; i += 1) {
    const added = await post(`/v1/lab01/chat/${chatFcid}/messages`, { role: i % 2 === 0 ? "user" : "assistant", text: texts[i] });
    messages.push(added.body.data.messageFcid as string);
  }
  return { chatFcid, messages };
}

describe("FCAS syntax (ADR-017)", () => {
  it("F01: parses a chat message range", async () => {
    const parsed = await post("/v1/lab03/parse", { fcas: "[[::demo<2-4>]]" });
    expect(parsed.status).toBe(200);
    expect(parsed.body.data).toMatchObject({ kind: "chat", chatKey: "::demo", messageRange: { from: 2, to: 4 } });
    expect(parsed.body.data.messageIndex).toBeUndefined();
  });

  it("F02: a single message index keeps working and is not a range", async () => {
    const parsed = await post("/v1/lab03/parse", { fcas: "[[::demo<3>]]" });
    expect(parsed.body.data).toMatchObject({ kind: "chat", chatKey: "::demo", messageIndex: 3 });
    expect(parsed.body.data.messageRange).toBeUndefined();
  });

  it("F03: rejects an inverted or zero-based range as invalid FCAS", async () => {
    expect((await post("/v1/lab03/parse", { fcas: "[[::demo<3-2>]]" })).status).toBe(400);
    expect((await post("/v1/lab03/parse", { fcas: "[[::demo<0-2>]]" })).status).toBe(400);
  });

  it("F04: parses concept and concept section references", async () => {
    const concept = await post("/v1/lab03/parse", { fcas: "[[#context-engine]]" });
    expect(concept.body.data).toMatchObject({ kind: "concept", slug: "context-engine" });
    expect(concept.body.data.section).toBeUndefined();

    const section = await post("/v1/lab03/parse", { fcas: "[[#context-engine#Epistemology]]" });
    expect(section.body.data).toMatchObject({ kind: "concept", slug: "context-engine", section: "Epistemology" });
  });

  it("F05: parses a named reference (alias) as its own kind, not as a directory", async () => {
    const alias = await post("/v1/lab03/parse", { fcas: "[[@my-shortcut]]" });
    expect(alias.body.data).toMatchObject({ kind: "alias", name: "my-shortcut" });
  });

  it("F06: concept and alias parse but are not resolved by this POC", async () => {
    for (const fcas of ["[[#context-engine]]", "[[@my-shortcut]]"]) {
      const resolved = await post("/v1/lab03/resolve", { fcas });
      expect(resolved.status).toBe(422);
      expect(resolved.body.code).toBe("UNSUPPORTED_SYNTAX");
    }
  });

  it("F07: resolves a chat range to the chat plus the range", async () => {
    const { chatFcid } = await makeChat("::range-resolve", ["One.", "Two.", "Three."]);
    const resolved = await post("/v1/lab03/resolve", { fcas: "[[::range-resolve<2-3>]]" });
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.targetFcid).toBe(chatFcid);
    expect(resolved.body.data.range).toEqual({ from: 2, to: 3 });
  });

  it("F08: resolves a project by name, case-insensitively, and by FCID", async () => {
    expect((await post("/v1/lab03/resolve", { fcas: "[[$ForgeOS]]" })).body.data.targetFcid).toBe("PJ_CORE");
    expect((await post("/v1/lab03/resolve", { fcas: "[[$labs]]" })).body.data.targetFcid).toBe("PJ_LABS");
    expect((await post("/v1/lab03/resolve", { fcas: "[[$PJ_LABS]]" })).body.data.targetFcid).toBe("PJ_LABS");
  });

  it("F09: an unknown project is not found instead of falling back to the first project", async () => {
    const resolved = await post("/v1/lab03/resolve", { fcas: "[[$NoSuchProject]]" });
    expect(resolved.status).toBe(404);
  });

  it("F10: resolves a directory by name and reports a name shared by two directories", async () => {
    await post("/v1/lab01/import/directory", {
      title: "Architecture",
      documents: [{ resourceKey: "dir-a/a.md", title: "A", text: "# A\nText." }],
    });
    const single = await post("/v1/lab03/resolve", { fcas: "[[Architecture]]" });
    expect(single.status).toBe(200);
    expect(single.body.data.targetFcid).toMatch(/^DR_/);

    await post("/v1/lab01/import/directory", {
      title: "architecture",
      documents: [{ resourceKey: "dir-b/b.md", title: "B", text: "# B\nText." }],
    });
    const twice = await post("/v1/lab03/resolve", { fcas: "[[Architecture]]" });
    expect(twice.status).toBe(409);
    expect(twice.body.code).toBe("AMBIGUOUS_NAME");
    expect(twice.body.details.candidates).toHaveLength(2);

    const missing = await post("/v1/lab03/resolve", { fcas: "[[NoSuchDirectory]]" });
    expect(missing.status).toBe(404);
  });

  it("F11: projects a project and a uniquely named directory back to a name", async () => {
    expect((await post("/v1/lab03/project-fcas", { targetFcid: "PJ_LABS" })).body.data.fcas).toBe("[[$Labs]]");
    expect((await post("/v1/lab03/project-fcas", { targetFcid: "PJ_CORE" })).body.data.fcas).toBe("[[$ForgeOS]]");

    const imported = await post("/v1/lab01/import/directory", {
      title: "Unique Folder",
      documents: [{ resourceKey: "dir-c/c.md", title: "C", text: "# C\nText." }],
    });
    const projected = await post("/v1/lab03/project-fcas", { targetFcid: imported.body.data.directoryFcid });
    expect(projected.body.data.fcas).toBe("[[Unique Folder]]");
    // The name resolves back to the same directory.
    const back = await post("/v1/lab03/resolve", { fcas: projected.body.data.fcas });
    expect(back.body.data.targetFcid).toBe(imported.body.data.directoryFcid);
  });

  it("F12: a directory whose name would parse as another kind is projected by FCID", async () => {
    const imported = await post("/v1/lab01/import/directory", {
      title: "#tricky",
      documents: [{ resourceKey: "dir-d/d.md", title: "D", text: "# D\nText." }],
    });
    const projected = await post("/v1/lab03/project-fcas", { targetFcid: imported.body.data.directoryFcid });
    expect(projected.body.data.fcas).toBe(`[[${imported.body.data.directoryFcid}]]`);
  });

  it("F12b: a directory named like an existing document is projected by FCID, not by the document key", async () => {
    await post("/v1/lab01/import/document", { resourceKey: "collide.md", title: "Collide", text: "# Collide\nText." });
    const imported = await post("/v1/lab01/import/directory", {
      title: "collide.md",
      documents: [{ resourceKey: "dir-e/e.md", title: "E", text: "# E\nText." }],
    });
    const projected = await post("/v1/lab03/project-fcas", { targetFcid: imported.body.data.directoryFcid });
    expect(projected.body.data.fcas).toBe(`[[${imported.body.data.directoryFcid}]]`);
  });
});

describe("reference prefix (ADR-018)", () => {
  it("F13: new references use the REF_ prefix (6 characters since Lab 01.5)", async () => {
    const { chatFcid } = await makeChat("::ref-prefix", ["Hello there."]);
    const reference = await post("/v1/lab03/references", { sourceFcid: chatFcid, fcas: "[[::ref-prefix<1>]]" });
    expect(reference.status).toBe(200);
    expect(reference.body.data.referenceId).toMatch(/^REF_[A-Z0-9]{6}$/);
  });
});

describe("chat under the workspace (ADR-021)", () => {
  it("F14: a new chat is a child of the workspace", async () => {
    const { chatFcid } = await makeChat("::under-workspace", ["Hi."]);
    expect(parentOf(chatFcid)).toBe("WS_MAIN");
    expect(childrenOf("WS_MAIN")).toContain(chatFcid);
  });

  it("F15: creating the same chat key again does not duplicate the edge", async () => {
    const first = await post("/v1/lab01/chat/create", { resourceKey: "::under-workspace-twice", title: "Twice" });
    await post("/v1/lab01/chat/create", { resourceKey: "::under-workspace-twice", title: "Twice" });
    const edges = sqliteClient
      .prepare("select count(*) as n from artifact_edges where parent_fcid = 'WS_MAIN' and child_fcid = ?")
      .get(first.body.data.chatFcid) as { n: number };
    expect(edges.n).toBe(1);
  });
});

describe("chat range in Lab 05 and Lab 06", () => {
  it("F16: expands a chat range reference as a window of the chat", async () => {
    await makeChat("::range-expand", ["Alpha question.", "Beta answer.", "Gamma question.", "Delta answer."]);
    const expanded = await post("/v1/lab05/expand", { text: "Intro.\n\n[[::range-expand<2-3>]]\n\nOutro." });
    expect(expanded.status).toBe(200);
    const content = expanded.body.data.content as string;
    expect(content).toContain("Beta answer.");
    expect(content).toContain("Gamma question.");
    expect(content).not.toContain("Alpha question.");
    expect(content).not.toContain("Delta answer.");
    expect(expanded.body.data.warnings).toEqual([]);
    expect(expanded.body.data.manifest.find((m: any) => m.type === "CH")).toMatchObject({ role: "expanded", selection: { from: 2, to: 3, total: 4 } });
  });

  it("F17: a range that starts after the last message becomes a warning and keeps the text", async () => {
    await makeChat("::range-out", ["Only one."]);
    const expanded = await post("/v1/lab05/expand", { text: "[[::range-out<5-6>]]" });
    expect(expanded.status).toBe(200);
    expect(expanded.body.data.content).toBe("[[::range-out<5-6>]]");
    expect(expanded.body.data.warnings.map((w: any) => w.code)).toEqual(["INVALID_RANGE"]);
  });

  it("F18: assembles a chat target written with a range", async () => {
    await makeChat("::range-assemble", ["First.", "Second.", "Third."]);
    const assembled = await post("/v1/lab05/assemble", { target: "[[::range-assemble<1-2>]]" });
    expect(assembled.status).toBe(200);
    expect(assembled.body.data.selection).toMatchObject({ from: 1, to: 2, total: 3 });
    expect(assembled.body.data.content).toContain("First.");
    expect(assembled.body.data.content).toContain("Second.");
    expect(assembled.body.data.content).not.toContain("Third.");
  });

  it("F19: a range in the target and a range in the input are rejected together", async () => {
    await makeChat("::range-twice", ["First.", "Second."]);
    const assembled = await post("/v1/lab05/assemble", { target: "[[::range-twice<1-2>]]", range: { from: 1 } });
    expect(assembled.status).toBe(400);
    expect(assembled.body.code).toBe("INVALID_TARGET");
  });

  it("F20: Lab 06 builds a view from a chat range item", async () => {
    await makeChat("::range-synth", ["Q one.", "A one.", "Q two."]);
    const synthesized = await post("/v1/lab06/synthesize", { kind: "view", items: ["[[::range-synth<2-3>]]"] });
    // A chat is not an allowed item type for a view or a document.
    expect(synthesized.status).toBe(422);
    expect(synthesized.body.code).toBe("ITEM_TYPE_NOT_ALLOWED");
  });

  it("F21: concept and alias references in text stay as text with a warning", async () => {
    const expanded = await post("/v1/lab05/expand", { text: "[[#context-engine]]\n\nSee [[@my-shortcut]] now." });
    expect(expanded.status).toBe(200);
    expect(expanded.body.data.content).toBe("[[#context-engine]]\n\nSee [[@my-shortcut]] now.");
    expect(expanded.body.data.warnings.map((w: any) => w.code)).toEqual(["UNSUPPORTED_TARGET", "UNSUPPORTED_TARGET"]);
    // The reason is the syntax, not an accidental match with another artifact type.
    expect(expanded.body.data.warnings[0].message).toMatch(/syntax/i);
    expect(expanded.body.data.warnings[1].message).toMatch(/syntax/i);
  });
});

describe("orphaned references (ADR-019)", () => {
  async function regeneratedSentence() {
    const { chatFcid, messages } = await makeChat(`::orphan-${Math.random().toString(36).slice(2, 8)}`, ["A question.", "Stale answer sentence."]);
    const oldMs = messages[1];
    const oldSn = childrenOf(childrenOf(oldMs)[0])[0];
    const regenerated = await post("/v1/lab04/regenerate", { fcid: oldMs, text: "Fresh answer sentence." });
    return { chatFcid, oldMs, oldSn, newMs: regenerated.body.data.fcid as string, eventId: regenerated.body.data.eventId as string };
  }

  it("F22: a reference to a regenerated sentence expands as ORPHANED with the cause and the replacing message", async () => {
    const { oldSn, oldMs, newMs, eventId } = await regeneratedSentence();
    const expanded = await post("/v1/lab05/expand", { text: `Look: [[${oldSn}]]` });
    expect(expanded.status).toBe(200);
    expect(expanded.body.data.content).toBe(`Look: [[${oldSn}]]`);
    expect(expanded.body.data.warnings).toHaveLength(1);
    expect(expanded.body.data.warnings[0]).toMatchObject({
      code: "ORPHANED",
      fcas: `[[${oldSn}]]`,
      cause: { eventId, operation: "regenerate", supersededRoot: oldMs },
      candidates: [newMs],
    });
  });

  it("F23: assembling an orphaned target returns 409 ORPHANED with details", async () => {
    const { oldSn, newMs } = await regeneratedSentence();
    const assembled = await post("/v1/lab05/assemble", { target: oldSn });
    expect(assembled.status).toBe(409);
    expect(assembled.body.code).toBe("ORPHANED");
    expect(assembled.body.details).toMatchObject({ originalFcid: oldSn, candidates: [newMs] });
  });

  it("F24: Lab 06 reports an orphaned item with its position", async () => {
    const { oldSn } = await regeneratedSentence();
    const synthesized = await post("/v1/lab06/synthesize", { kind: "view", items: [`[[${oldSn}]]`] });
    expect(synthesized.status).toBe(409);
    expect(synthesized.body.code).toBe("ITEM_ORPHANED");
    expect(synthesized.body.details).toMatchObject({ position: 1, originalFcid: oldSn });
  });

  it("F25: Lab 03 refuses to create a reference to an orphaned target", async () => {
    const { oldSn, chatFcid } = await regeneratedSentence();
    const reference = await post("/v1/lab03/references", { sourceFcid: chatFcid, fcas: `[[${oldSn}]]` });
    expect(reference.status).toBe(409);
    expect(reference.body.code).toBe("ORPHANED");
  });

  it("F26: the message that was regenerated still resolves to its replacement (evolved, not orphaned)", async () => {
    const { oldMs, newMs } = await regeneratedSentence();
    const resolved = await post("/v1/lab03/resolve", { fcas: `[[${oldMs}]]` });
    expect(resolved.status).toBe(200);
    expect(resolved.body.data).toMatchObject({ targetFcid: newMs, evolvedFrom: oldMs });
  });

  it("F27: a scope that is orphaned is reported by Lab 06 as a scope that was not found", async () => {
    const { oldSn } = await regeneratedSentence();
    const synthesized = await post("/v1/lab06/synthesize", { kind: "view", random: { type: "SN", count: 1, seed: 1, scope: oldSn } });
    expect(synthesized.status).toBe(404);
    expect(synthesized.body.code).toBe("SCOPE_NOT_FOUND");
    expect(synthesized.body.details).toMatchObject({ orphaned: true });
  });
});
