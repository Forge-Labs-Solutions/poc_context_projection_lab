import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../api/app.js";
import { sqliteClient } from "../db/client.js";
import { classifyFidelity, migrateForgeosChats } from "../core/forgeosMigration.js";
import { resetAndSeed } from "../seeds/seed.js";

// Lab 01.5 Part B — migration of ForgeOS chats. Scenarios C21–C33 from docs/lab 01.5.md.
// The source is a synthetic database with the columns of the real ForgeOS one (nothing real enters the tests).

const app = buildApp();
const workDir = mkdtempSync(join(tmpdir(), "lab015-"));
let sourcePath = "";
let sourceCounter = 0;

beforeAll(async () => {
  await resetAndSeed();
});

afterAll(async () => {
  await app.close();
  try {
    rmSync(workDir, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // A temporary folder that Windows still holds is not a test failure; the OS cleans it up.
  }
});

const SCHEMA = `
create table chats (id text primary key, workspace_id text, title text, status text, created_at text, updated_at text, fcid text, reference_name text, project_id text, visibility text, created_by_user_id text, ai_model_id text);
create table messages (id text primary key, workspace_id text, chat_id text, role text, content text, position integer, created_at text, fcid text, author_user_id text, recipient text, ai_provider text, ai_model text);
create table cognitive_references (id text primary key, workspace_id text, fcid text, display_fcas text, normalized_fcas text, target_fcid text, target_type text, source_fcid text, source_type text, source_message_id text, source_chat_id text, status text, created_at text, updated_at text);
create table chat_lineage (chat_id text, parent_chat_id text, origin_chat_id text, branch_type text, start_message_id text, end_message_id text, start_position integer, end_position integer, created_at text);
create table context_blocks (id text primary key, workspace_id text, fcid text, source_type text, source_id text, chat_id text, message_id text, role text, content text, content_hash text, created_at text);
create table concepts (id text primary key, workspace_id text, fcid text, name text, slug text, definition text, created_at text, updated_at text, project_id text, created_by_user_id text);
`;

type SourceChat = { fcid: string; referenceName: string | null; status?: string; projectId?: string | null; title?: string };
type SourceMessage = { fcid: string; chat: string; position: number; role: string; content: string };

function chatsDefault(): SourceChat[] {
  return [
    { fcid: "CH_AAAAAA", referenceName: "padaria", projectId: "proj-1", title: "Padaria" },
    { fcid: "CH_BBBBBB", referenceName: "padaria", title: "Padaria de novo" },
    { fcid: "CH_CCCCCC", referenceName: "antigo", status: "deleted", title: "Antigo" },
    { fcid: "CH_DDDDDD", referenceName: null, title: "Vazio" },
  ];
}

function messagesDefault(): SourceMessage[] {
  return [
    // Inserted out of order on purpose: the order is the position.
    { fcid: "MS_CCCCCC", chat: "CH_AAAAAA", position: 2, role: "user", content: "## Passos\n\n- item um\n- item dois" },
    { fcid: "MS_AAAAAA", chat: "CH_AAAAAA", position: 0, role: "user", content: "Como começo a assar pão?" },
    {
      fcid: "MS_BBBBBB",
      chat: "CH_AAAAAA",
      position: 1,
      role: "assistant",
      content: "Comece pela massa.\nUse farinha e água.\n\n## Fermento\n\nUse fermento seco.",
    },
    { fcid: "MS_DDDDDD", chat: "CH_BBBBBB", position: 0, role: "user", content: "Outra conversa sobre pão." },
    { fcid: "MS_EEEEEE", chat: "CH_CCCCCC", position: 0, role: "user", content: "Uma conversa apagada." },
  ];
}

function makeSource(options: { chats?: SourceChat[]; messages?: SourceMessage[]; extra?: (db: Database.Database) => void } = {}): string {
  sourceCounter += 1;
  const path = join(workDir, `source-${sourceCounter}`, "copy.db");
  const dir = join(workDir, `source-${sourceCounter}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const db = new Database(path);
  db.exec(SCHEMA);
  writeRows(db, options.chats ?? chatsDefault(), options.messages ?? messagesDefault());
  db.prepare("insert into cognitive_references values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run("r1", "ws1", "REF_AAAAAA", "[[::CH_AAAAAA<2>]]", "x", "MS_BBBBBB", "message", "MS_CCCCCC", "message", "m3", "c1", "resolved", "t", "t");
  db.prepare("insert into cognitive_references values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run("r2", "ws1", "REF_BBBBBB", "[[#massa]]", "x", "CN_XXXXXX", "concept", "MS_CCCCCC", "message", "m3", "c1", "resolved", "t", "t");
  db.prepare("insert into cognitive_references values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run("r3", "ws1", "REF_CCCCCC", "[[::CH_AAAAAA<1>]]", "x", "MS_AAAAAA", "message", "MS_CCCCCC", "message", "m3", "c1", "stale", "t", "t");
  db.prepare("insert into chat_lineage values (?,?,?,?,?,?,?,?,?)").run("CH_BBBBBB", "CH_AAAAAA", "CH_AAAAAA", "message", "m1", "m2", 0, 1, "t");
  db.prepare("insert into chat_lineage values (?,?,?,?,?,?,?,?,?)").run("CH_DDDDDD", "CH_AAAAAA", "CH_AAAAAA", "range", "m1", "m2", 0, 1, "t");
  options.extra?.(db);
  db.close();
  return path;
}

function writeRows(db: Database.Database, chats: SourceChat[], messages: SourceMessage[]): void {
  const ids = new Map<string, string>();
  chats.forEach((chat, i) => {
    const id = `chat-${i}`;
    ids.set(chat.fcid, id);
    db.prepare("insert into chats values (?,?,?,?,?,?,?,?,?,?,?,?)").run(id, "ws1", chat.title ?? chat.fcid, chat.status ?? "active", "t0", "t1", chat.fcid, chat.referenceName, chat.projectId ?? null, "private", "user-1", "model-1");
  });
  messages.forEach((m, i) => {
    db.prepare("insert into messages values (?,?,?,?,?,?,?,?,?,?,?,?)").run(`msg-${m.fcid}-${i}`, "ws1", ids.get(m.chat), m.role, m.content, m.position, "t2", m.fcid, "user-1", null, "provider-1", "model-1");
  });
}

function fileHash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function count(table: string): number {
  return (sqliteClient.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n;
}

function artifactRow(fcid: string): { type: string; state: string; metadata_json: string | null } | undefined {
  return sqliteClient.prepare("select type, state, metadata_json from artifacts where fcid = ?").get(fcid) as
    | { type: string; state: string; metadata_json: string | null }
    | undefined;
}

function children(fcid: string): string[] {
  return (
    sqliteClient
      .prepare("select child_fcid from artifact_edges where parent_fcid = ? and relation_type = 'contains' order by order_index")
      .all(fcid) as Array<{ child_fcid: string }>
  ).map((r) => r.child_fcid);
}

async function resolve(fcas: string) {
  const response = await app.inject({ method: "POST", url: "/v1/lab03/resolve", payload: { fcas } });
  return { status: response.statusCode, body: response.json() as Record<string, any> };
}

describe("Lab 01.5 Part B — ForgeOS chat migration", () => {
  beforeEach(async () => {
    await resetAndSeed();
    sourcePath = makeSource();
  });

  it("C21: CH and MS receive exactly the FCIDs of the source", () => {
    const report = migrateForgeosChats({ sourcePath });

    expect(artifactRow("CH_AAAAAA")?.type).toBe("CH");
    expect(artifactRow("CH_BBBBBB")?.type).toBe("CH");
    for (const fcid of ["MS_AAAAAA", "MS_BBBBBB", "MS_CCCCCC", "MS_DDDDDD"]) expect(artifactRow(fcid)?.type).toBe("MS");
    expect(report.preservation).toEqual({ chats: { expected: 3, preserved: 3 }, messages: { expected: 4, preserved: 4 } });
  });

  it("C22: the messages follow position, and <N> is position + 1", async () => {
    migrateForgeosChats({ sourcePath });

    expect(children("CH_AAAAAA")).toEqual(["MS_AAAAAA", "MS_BBBBBB", "MS_CCCCCC"]);
    // The chat key is its reference_name; here the name is shared, so the FCID is the key.
    expect((await resolve("[[::CH_AAAAAA<1>]]")).body.data.targetFcid).toBe("MS_AAAAAA");
    expect((await resolve("[[::CH_AAAAAA<2>]]")).body.data.targetFcid).toBe("MS_BBBBBB");
    expect((await resolve("[[::CH_AAAAAA<3>]]")).body.data.targetFcid).toBe("MS_CCCCCC");
  });

  it("C23: the source fields are kept in metadata.source", () => {
    migrateForgeosChats({ sourcePath });

    const message = JSON.parse(artifactRow("MS_AAAAAA")?.metadata_json ?? "{}");
    expect(message.role).toBe("user");
    expect(message.source).toMatchObject({ authorUserId: "user-1", aiProvider: "provider-1", aiModel: "model-1", position: 0 });
    const chat = JSON.parse(artifactRow("CH_AAAAAA")?.metadata_json ?? "{}");
    expect(chat.source).toMatchObject({ system: "forgeos", status: "active", projectId: "proj-1", workspaceId: "ws1", referenceName: "padaria" });
  });

  it("C23b: a change in the source metadata is applied on the next run and counted", () => {
    migrateForgeosChats({ sourcePath });

    const db = new Database(sourcePath);
    db.prepare("update chats set project_id = ? where fcid = 'CH_AAAAAA'").run("proj-2");
    db.prepare("update messages set ai_model = ? where fcid = 'MS_AAAAAA'").run("model-2");
    db.close();
    const again = migrateForgeosChats({ sourcePath });

    expect(again.runChanges).toMatchObject({ metadata: 2, added: 0, edited: 0, replaced: 0, removed: 0 });
    expect(JSON.parse(artifactRow("CH_AAAAAA")?.metadata_json ?? "{}").source.projectId).toBe("proj-2");
    expect(JSON.parse(artifactRow("MS_AAAAAA")?.metadata_json ?? "{}").source.aiModel).toBe("model-2");
  });

  it("C24: a deleted chat stays out by default and comes in marked with includeDeleted", () => {
    const report = migrateForgeosChats({ sourcePath });
    expect(artifactRow("CH_CCCCCC")).toBeUndefined();
    expect(artifactRow("MS_EEEEEE")).toBeUndefined();
    expect(report.counts.chatsDeletedOmitted).toBe(1);
    expect(report.gaps.deletedChats).toBe(1);

    const withDeleted = migrateForgeosChats({ sourcePath, includeDeleted: true });
    expect(artifactRow("CH_CCCCCC")?.type).toBe("CH");
    expect(JSON.parse(artifactRow("CH_CCCCCC")?.metadata_json ?? "{}").source.status).toBe("deleted");
    expect(withDeleted.counts.chatsMigrated).toBe(4);
  });

  it("C25: a chat without messages becomes a CH without children", () => {
    migrateForgeosChats({ sourcePath });
    expect(artifactRow("CH_DDDDDD")?.type).toBe("CH");
    expect(children("CH_DDDDDD")).toEqual([]);
  });

  it("C26: an FCID that already exists elsewhere refuses that chat and writes nothing of it", () => {
    sqliteClient
      .prepare("insert into artifacts (fcid, type, category, state, metadata_json) values ('MS_BBBBBB', 'MS', 'structural', 'active', '{}')")
      .run();

    const report = migrateForgeosChats({ sourcePath });

    expect(report.refused).toHaveLength(1);
    expect(report.refused[0]).toMatchObject({ chat: "CH_AAAAAA" });
    expect(report.refused[0].reason).toMatch(/FCID/i);
    expect(artifactRow("CH_AAAAAA")).toBeUndefined();
    expect(artifactRow("MS_AAAAAA")).toBeUndefined();
    // The other chats still came in.
    expect(artifactRow("CH_BBBBBB")?.type).toBe("CH");
    expect(report.counts.chatsRefused).toBe(1);
    expect(report.counts.chatsMigrated).toBe(2);
  });

  it("C27: a reference to a message migrates with its REF_ id preserved", () => {
    const report = migrateForgeosChats({ sourcePath });

    const migrated = sqliteClient.prepare("select * from \"references\" where reference_id = 'REF_AAAAAA'").get() as Record<string, string>;
    expect(migrated).toMatchObject({ source_fcid: "MS_CCCCCC", target_fcid: "MS_BBBBBB", status: "resolved", fcas_raw: "[[::CH_AAAAAA<2>]]" });
    // A stale reference keeps its status.
    expect(sqliteClient.prepare("select status from \"references\" where reference_id = 'REF_CCCCCC'").get()).toEqual({ status: "stale" });
    expect(report.references).toMatchObject({ read: 3, migrated: 2, staleMigrated: 1 });
  });

  it("C28: a reference to a concept does not migrate and is counted", () => {
    const report = migrateForgeosChats({ sourcePath });

    expect(sqliteClient.prepare("select count(*) as n from \"references\" where reference_id = 'REF_BBBBBB'").get()).toEqual({ n: 0 });
    expect(report.references.conceptTargets).toBe(1);
    expect(report.gaps.conceptReferences).toBe(1);
    expect(report.gaps.staleReferences).toBe(1);
  });

  it("C29: chat lineage does not migrate and is counted by type", () => {
    const lineageBefore = count("artifact_lineage");
    const report = migrateForgeosChats({ sourcePath });

    expect(count("artifact_lineage")).toBe(lineageBefore);
    expect(report.gaps.chatLineage).toEqual({ total: 2, byType: { message: 1, range: 1 } });
  });

  it("C30: running it again changes nothing", () => {
    migrateForgeosChats({ sourcePath });
    const counts = { artifacts: count("artifacts"), edges: count("artifact_edges"), events: count("evolution_events"), projections: count("projections"), references: count("\"references\"") };

    const again = migrateForgeosChats({ sourcePath });

    expect({ artifacts: count("artifacts"), edges: count("artifact_edges"), events: count("evolution_events"), projections: count("projections"), references: count("\"references\"") }).toEqual(counts);
    expect(again.runChanges).toMatchObject({ added: 0, edited: 0, replaced: 0, removed: 0, moved: 0, metadata: 0 });
    expect(again.runChanges.kept).toBeGreaterThan(0);
    expect(again.counts.chatsCreated).toBe(0);
    expect(again.references.migrated).toBe(0);
    expect(again.references.unchanged).toBe(2);
  });

  it("C31: a new message in the source adds only that message", () => {
    migrateForgeosChats({ sourcePath });
    const before = count("artifacts");

    const db = new Database(sourcePath);
    db.prepare("insert into messages values (?,?,?,?,?,?,?,?,?,?,?,?)").run("msg-new", "ws1", "chat-0", "assistant", "Resposta nova.", 3, "t3", "MS_FFFFFF", "user-1", null, "provider-1", "model-1");
    db.close();
    const again = migrateForgeosChats({ sourcePath });

    expect(again.runChanges).toMatchObject({ added: 1, edited: 0, replaced: 0, removed: 0 });
    expect(children("CH_AAAAAA")).toEqual(["MS_AAAAAA", "MS_BBBBBB", "MS_CCCCCC", "MS_FFFFFF"]);
    expect(count("artifacts")).toBe(before + 1 /* MS */ + 1 /* PG */ + 1 /* SN */);
  });

  it("C31b: a message edited in the source keeps its MS and updates the content", () => {
    migrateForgeosChats({ sourcePath });

    const db = new Database(sourcePath);
    db.prepare("update messages set content = ? where fcid = 'MS_AAAAAA'").run("Como começo a assar pão em casa?");
    db.close();
    const again = migrateForgeosChats({ sourcePath });

    expect(artifactRow("MS_AAAAAA")?.state).toBe("active");
    expect(again.runChanges.edited + again.runChanges.replaced).toBe(1);
  });

  it("C32: the source is never written, and the original database path is refused", () => {
    const hashBefore = fileHash(sourcePath);
    migrateForgeosChats({ sourcePath });
    migrateForgeosChats({ sourcePath });
    expect(fileHash(sourcePath)).toBe(hashBefore);

    expect(() => migrateForgeosChats({ sourcePath: "C:/projetos/pessoal/Forge Labs/forgeos/.forgeos/forgeos.db" })).toThrow(/ORIGINAL_DATABASE_REFUSED/);
    expect(() => migrateForgeosChats({ sourcePath: "C:\\somewhere\\.forgeos\\forgeos.db" })).toThrow(/ORIGINAL_DATABASE_REFUSED/);
  });

  it("C33: the four fidelity classes are detected", () => {
    expect(classifyFidelity("Uma frase simples.", "Uma frase simples.").class).toBe("exact");
    expect(classifyFidelity("Linha um\nlinha dois.", "Linha um linha dois.").class).toBe("whitespace");
    expect(classifyFidelity("- item um\n- item dois", "- item um - item dois")).toEqual({ class: "structure", categories: ["list"] });
    expect(classifyFidelity("Uma frase com **ênfase**.", "Uma frase com ênfase.")).toEqual({ class: "structure", categories: ["emphasis"] });
    expect(classifyFidelity("Texto inteiro aqui.", "Texto aqui.").class).toBe("loss");
    expect(classifyFidelity("```\ncodigo()\n```", "``` codigo() ```")).toEqual({ class: "structure", categories: ["code"] });
  });

  it("C33b: the report counts the fidelity classes of the migrated messages", () => {
    const report = migrateForgeosChats({ sourcePath });

    // MS_AAAAAA and MS_DDDDDD exact; MS_BBBBBB whitespace; MS_CCCCCC structure (a list under a heading is
    // joined into one paragraph; without a heading the line breaks of a paragraph are kept).
    expect(report.fidelity).toMatchObject({ exact: 2, whitespace: 1, structure: 1, loss: 0, structureCategories: { list: 1 } });
  });

  it("the report has counts only, never message text", () => {
    const report = migrateForgeosChats({ sourcePath });
    const json = JSON.stringify(report);
    expect(json).not.toContain("Como começo");
    expect(json).not.toContain("fermento seco");
    expect(json).not.toContain("item um");
  });

  it("a shared reference_name is not used as the chat key, and a unique one is", async () => {
    sourcePath = makeSource({
      chats: [
        { fcid: "CH_AAAAAA", referenceName: "unico", title: "Unico" },
        { fcid: "CH_BBBBBB", referenceName: "repetido", title: "R1" },
        { fcid: "CH_CCCCCC", referenceName: "repetido", title: "R2" },
        { fcid: "CH_DDDDDD", referenceName: "a<b", title: "Unsafe" },
      ],
      messages: [
        { fcid: "MS_AAAAAA", chat: "CH_AAAAAA", position: 0, role: "user", content: "Primeira." },
        { fcid: "MS_BBBBBB", chat: "CH_BBBBBB", position: 0, role: "user", content: "Segunda." },
        { fcid: "MS_CCCCCC", chat: "CH_CCCCCC", position: 0, role: "user", content: "Terceira." },
        { fcid: "MS_DDDDDD", chat: "CH_DDDDDD", position: 0, role: "user", content: "Quarta." },
      ],
    });
    const report = migrateForgeosChats({ sourcePath });

    expect((await resolve("[[::unico<1>]]")).body.data.targetFcid).toBe("MS_AAAAAA");
    expect((await resolve("[[::CH_BBBBBB<1>]]")).body.data.targetFcid).toBe("MS_BBBBBB");
    expect((await resolve("[[::CH_DDDDDD<1>]]")).body.data.targetFcid).toBe("MS_DDDDDD");
    expect(report.gaps.referenceNameCollisions).toBe(2);
    expect(report.gaps.unsafeReferenceNames).toBe(1);
  });
});
