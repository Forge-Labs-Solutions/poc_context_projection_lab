import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";
import { and, eq } from "drizzle-orm";
import { db, sqliteClient } from "../db/client.js";
import { artifactEdges, artifacts, referencesTable } from "../db/schema.js";
import { FcidConflictError, importChat, type ChangeSummary, type ChatMessageInput } from "./lab015Service.js";
import { renderArtifactNode } from "./projectionService.js";

// Lab 01.5 Part B — migration of ForgeOS chats into CH > MS > SS/PG > SN. Rules: docs/lab 01.5.md.
// The source is a COPY of the ForgeOS database, opened read-only. The report has counts only, never message text.

export type FidelityClass = "exact" | "whitespace" | "structure" | "loss";

export type MigrationReport = {
  source: { file: string; includeDeleted: boolean };
  durationMs: number;
  counts: {
    chatsRead: number;
    chatsDeletedOmitted: number;
    chatsMigrated: number;
    chatsCreated: number;
    chatsRefused: number;
    messagesRead: number;
    messagesMigrated: number;
    emptyMessages: number;
  };
  runChanges: ChangeSummary;
  artifactsCreated: Record<string, number>;
  databaseBytes: { before: number | null; after: number | null };
  preservation: { chats: { expected: number; preserved: number }; messages: { expected: number; preserved: number } };
  fidelity: { exact: number; whitespace: number; structure: number; loss: number; structureCategories: Record<string, number> };
  references: {
    read: number;
    migrated: number;
    unchanged: number;
    updated: number;
    staleMigrated: number;
    conceptTargets: number;
    otherTargets: number;
    sourceNotMigrated: number;
    targetNotMigrated: number;
  };
  gaps: {
    deletedChats: number;
    conceptReferences: number;
    staleReferences: number;
    chatLineage: { total: number; byType: Record<string, number> };
    chatsWithProject: number;
    chatsWithoutReferenceName: number;
    referenceNameCollisions: number;
    unsafeReferenceNames: number;
    messagesWithAuthor: number;
    messagesWithModelInfo: number;
  };
  refused: Array<{ chat: string; reason: string }>;
};

// ---------- safety ----------

/** The ForgeOS keeps its database at `.forgeos/forgeos.db`. Anything that looks like that is the original. */
export function assertSafePaths(sourcePath: string, targetPath: string): void {
  const normalized = (path: string) => resolve(path).replace(/\\/g, "/").toLowerCase();
  const source = normalized(sourcePath);
  const target = normalized(targetPath);
  if (source.endsWith("/.forgeos/forgeos.db")) throw new Error("ORIGINAL_DATABASE_REFUSED: copy the database and pass the copy");
  if (source === target) throw new Error("SOURCE_IS_TARGET: the source and the target are the same file");
  if (target.includes("/.forgeos/")) throw new Error("ORIGINAL_DATABASE_REFUSED: the target is inside .forgeos");
}

// ---------- fidelity ----------

const BLOCK_CATEGORIES = new Set(["code", "list", "table", "quote", "rule"]);

function detectCategories(source: string): string[] {
  const found: string[] = [];
  if (/^\s*(```|~~~)/m.test(source)) found.push("code");
  if (/^\s*(?:[-*+]|\d+[.)])\s+\S/m.test(source)) found.push("list");
  if (/^\s*\|.+\|\s*$/m.test(source)) found.push("table");
  if (/^\s*>/m.test(source)) found.push("quote");
  if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/m.test(source)) found.push("rule");
  if (/(\*\*|__)(?=\S)[^\n]*?\S\1/.test(source) || /(?<![*\w])\*(?=\S)[^*\n]*?\S\*(?![*\w])/.test(source)) found.push("emphasis");
  if (/`[^`\n]+`/.test(source)) found.push("inline-code");
  if (/\[[^\]\n]+\]\([^)\n]+\)/.test(source)) found.push("link");
  return found.length > 0 ? found : ["other"];
}

/**
 * Compares the source text of a message with what the POC rebuilds from SS, PG and SN.
 * exact: identical. whitespace: only spaces and line breaks differ. structure: every letter and digit is there,
 * but the form changed (list, code block, table, quote, emphasis...). loss: something is missing.
 */
export function classifyFidelity(source: string, rebuilt: string): { class: FidelityClass; categories: string[] } {
  const a = source.replace(/\r\n/g, "\n").trim();
  const b = rebuilt.replace(/\r\n/g, "\n").trim();
  if (a === b) return { class: "exact", categories: [] };

  const categories = detectCategories(a);
  const collapse = (text: string) => text.replace(/\s+/g, " ").trim();
  // Line breaks inside a list, a code block or a table are part of its structure, so they do not count as whitespace.
  if (collapse(a) === collapse(b) && !categories.some((c) => BLOCK_CATEGORIES.has(c))) {
    return { class: "whitespace", categories: [] };
  }

  const letters = (text: string) => text.normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "");
  if (letters(a) === letters(b)) return { class: "structure", categories };
  return { class: "loss", categories: [] };
}

// ---------- migration ----------

type SourceChat = {
  id: string;
  workspace_id: string | null;
  title: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  fcid: string | null;
  reference_name: string | null;
  project_id: string | null;
  visibility: string | null;
  created_by_user_id: string | null;
  ai_model_id: string | null;
};

type SourceMessage = {
  chat_id: string;
  role: string;
  content: string;
  position: number;
  created_at: string | null;
  fcid: string | null;
  author_user_id: string | null;
  recipient: string | null;
  ai_provider: string | null;
  ai_model: string | null;
};

type SourceReference = {
  fcid: string;
  display_fcas: string;
  target_fcid: string;
  target_type: string;
  source_fcid: string;
  status: string;
};

const UNSAFE_NAME = /[<>[\]\n\r]/;

function fileSize(path: string): number | null {
  try {
    return statSync(resolve(path)).size;
  } catch {
    return null;
  }
}

function countByType(): Record<string, number> {
  const rows = sqliteClient.prepare("select type, count(*) as n from artifacts group by type").all() as Array<{ type: string; n: number }>;
  return Object.fromEntries(rows.map((row) => [row.type, row.n]));
}

function exists(fcid: string): boolean {
  return !!db.select({ fcid: artifacts.fcid }).from(artifacts).where(eq(artifacts.fcid, fcid)).get();
}

export function migrateForgeosChats(options: { sourcePath: string; includeDeleted?: boolean; targetPath?: string }): MigrationReport {
  const targetPath = options.targetPath ?? process.env.DATABASE_URL ?? "./data/forgeos.db";
  assertSafePaths(options.sourcePath, targetPath);
  const sourceFile = resolve(options.sourcePath);
  if (!existsSync(sourceFile)) throw new Error("SOURCE_NOT_FOUND");

  const started = Date.now();
  const source = new Database(sourceFile, { readonly: true, fileMustExist: true });
  try {
    const chats = source.prepare("select * from chats").all() as SourceChat[];
    const messages = source.prepare("select * from messages order by chat_id, position").all() as SourceMessage[];
    const references = source.prepare("select * from cognitive_references").all() as SourceReference[];
    const lineage = source.prepare("select branch_type, count(*) as n from chat_lineage group by branch_type").all() as Array<{ branch_type: string; n: number }>;

    const messagesByChat = new Map<string, SourceMessage[]>();
    for (const message of messages) {
      const list = messagesByChat.get(message.chat_id) ?? [];
      list.push(message);
      messagesByChat.set(message.chat_id, list);
    }

    // The chat key must not depend on which chats are being migrated, so names are counted over all chats.
    const nameCount = new Map<string, number>();
    for (const chat of chats) {
      const name = (chat.reference_name ?? "").trim();
      if (name !== "") nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
    }

    const report: MigrationReport = {
      source: { file: sourceFile.split(/[\\/]/).pop() ?? "", includeDeleted: options.includeDeleted === true },
      durationMs: 0,
      counts: {
        chatsRead: chats.length,
        chatsDeletedOmitted: 0,
        chatsMigrated: 0,
        chatsCreated: 0,
        chatsRefused: 0,
        messagesRead: 0,
        messagesMigrated: 0,
        emptyMessages: 0,
      },
      runChanges: { kept: 0, edited: 0, replaced: 0, removed: 0, added: 0, moved: 0, metadata: 0 },
      artifactsCreated: {},
      databaseBytes: { before: fileSize(targetPath), after: null },
      preservation: { chats: { expected: 0, preserved: 0 }, messages: { expected: 0, preserved: 0 } },
      fidelity: { exact: 0, whitespace: 0, structure: 0, loss: 0, structureCategories: {} },
      references: {
        read: references.length,
        migrated: 0,
        unchanged: 0,
        updated: 0,
        staleMigrated: 0,
        conceptTargets: 0,
        otherTargets: 0,
        sourceNotMigrated: 0,
        targetNotMigrated: 0,
      },
      gaps: {
        deletedChats: chats.filter((c) => c.status === "deleted").length,
        conceptReferences: references.filter((r) => r.target_type === "concept").length,
        staleReferences: references.filter((r) => r.status === "stale").length,
        chatLineage: { total: lineage.reduce((sum, row) => sum + row.n, 0), byType: Object.fromEntries(lineage.map((row) => [row.branch_type, row.n])) },
        chatsWithProject: 0,
        chatsWithoutReferenceName: chats.filter((c) => (c.reference_name ?? "").trim() === "").length,
        referenceNameCollisions: chats.filter((c) => (nameCount.get((c.reference_name ?? "").trim()) ?? 0) > 1).length,
        unsafeReferenceNames: chats.filter((c) => UNSAFE_NAME.test(c.reference_name ?? "")).length,
        messagesWithAuthor: messages.filter((m) => m.author_user_id).length,
        messagesWithModelInfo: messages.filter((m) => m.ai_provider || m.ai_model).length,
      },
      refused: [],
    };

    const before = countByType();
    const migrated: Array<{ chat: SourceChat; messages: SourceMessage[] }> = [];

    for (const chat of chats) {
      if (chat.status === "deleted" && !options.includeDeleted) {
        report.counts.chatsDeletedOmitted += 1;
        continue;
      }
      const chatMessages = messagesByChat.get(chat.id) ?? [];
      report.counts.messagesRead += chatMessages.length;
      if (chat.project_id) report.gaps.chatsWithProject += 1;

      const fcid = chat.fcid;
      if (!fcid) {
        report.refused.push({ chat: chat.id, reason: "The chat has no fcid" });
        report.counts.chatsRefused += 1;
        continue;
      }
      if (chatMessages.some((m) => !m.fcid)) {
        report.refused.push({ chat: fcid, reason: "A message has no fcid" });
        report.counts.chatsRefused += 1;
        continue;
      }

      const name = (chat.reference_name ?? "").trim();
      const usable = name !== "" && !UNSAFE_NAME.test(name) && nameCount.get(name) === 1;
      const input = {
        resourceKey: `::${usable ? name : fcid}`,
        title: chat.title ?? fcid,
        chatFcid: fcid,
        metadata: {
          source: {
            system: "forgeos",
            id: chat.id,
            workspaceId: chat.workspace_id,
            status: chat.status,
            referenceName: chat.reference_name,
            projectId: chat.project_id,
            visibility: chat.visibility,
            createdByUserId: chat.created_by_user_id,
            aiModelId: chat.ai_model_id,
            createdAt: chat.created_at,
            updatedAt: chat.updated_at,
          },
        },
        messages: chatMessages.map<ChatMessageInput>((m) => ({
          fcid: m.fcid as string,
          role: m.role,
          text: m.content,
          metadata: {
            source: {
              position: m.position,
              authorUserId: m.author_user_id,
              recipient: m.recipient,
              aiProvider: m.ai_provider,
              aiModel: m.ai_model,
              createdAt: m.created_at,
            },
          },
        })),
      };

      try {
        const result = importChat(input);
        report.counts.chatsMigrated += 1;
        if (result.created) report.counts.chatsCreated += 1;
        for (const key of Object.keys(report.runChanges) as Array<keyof ChangeSummary>) report.runChanges[key] += result.summary[key];
        migrated.push({ chat, messages: chatMessages });
      } catch (error) {
        const reason =
          error instanceof FcidConflictError ? `FCID conflict (${error.fcid}): ${error.reason}` : error instanceof Error ? error.message : "Unknown error";
        report.refused.push({ chat: fcid, reason });
        report.counts.chatsRefused += 1;
      }
    }

    migrateReferences(report, references);
    measure(report, migrated);

    const after = countByType();
    for (const type of Object.keys(after)) {
      const delta = after[type] - (before[type] ?? 0);
      if (delta !== 0) report.artifactsCreated[type] = delta;
    }
    report.databaseBytes.after = fileSize(targetPath);
    report.durationMs = Date.now() - started;
    return report;
  } finally {
    source.close();
  }
}

function migrateReferences(report: MigrationReport, references: SourceReference[]): void {
  for (const ref of references) {
    if (ref.target_type !== "message") {
      if (ref.target_type === "concept") report.references.conceptTargets += 1;
      else report.references.otherTargets += 1;
      continue;
    }
    const sourceOk = exists(ref.source_fcid);
    const targetOk = exists(ref.target_fcid);
    if (!sourceOk) report.references.sourceNotMigrated += 1;
    if (!targetOk) report.references.targetNotMigrated += 1;
    if (!sourceOk || !targetOk) continue;

    const wanted = { sourceFcid: ref.source_fcid, fcasRaw: ref.display_fcas, targetFcid: ref.target_fcid, status: ref.status };
    const current = db.select().from(referencesTable).where(eq(referencesTable.referenceId, ref.fcid)).get();
    if (!current) {
      db.insert(referencesTable).values({ referenceId: ref.fcid, ...wanted }).run();
      report.references.migrated += 1;
      if (ref.status === "stale") report.references.staleMigrated += 1;
    } else if (
      current.sourceFcid === wanted.sourceFcid &&
      current.fcasRaw === wanted.fcasRaw &&
      current.targetFcid === wanted.targetFcid &&
      current.status === wanted.status
    ) {
      report.references.unchanged += 1;
    } else {
      db.update(referencesTable).set(wanted).where(and(eq(referencesTable.referenceId, ref.fcid))).run();
      report.references.updated += 1;
    }
  }
}

/** Preservation of the FCIDs and fidelity of the text, from what is in the target after the run. */
function measure(report: MigrationReport, migrated: Array<{ chat: SourceChat; messages: SourceMessage[] }>): void {
  const nodesMap = new Map(db.select().from(artifacts).all().map((row) => [row.fcid, row]));
  const childrenMap = new Map<string, Array<typeof artifactEdges.$inferSelect>>();
  for (const edge of db.select().from(artifactEdges).all()) {
    const list = childrenMap.get(edge.parentFcid) ?? [];
    list.push(edge);
    childrenMap.set(edge.parentFcid, list);
  }
  for (const list of childrenMap.values()) list.sort((a, b) => a.orderIndex - b.orderIndex);

  for (const { chat, messages } of migrated) {
    report.preservation.chats.expected += 1;
    if (nodesMap.get(chat.fcid as string)?.type === "CH") report.preservation.chats.preserved += 1;

    for (const message of messages) {
      report.counts.messagesMigrated += 1;
      report.preservation.messages.expected += 1;
      if (message.content.trim() === "") report.counts.emptyMessages += 1;
      const row = nodesMap.get(message.fcid as string);
      if (!row || row.type !== "MS") continue;
      report.preservation.messages.preserved += 1;

      const rebuilt = renderArtifactNode(row, nodesMap, childrenMap).markdown.replace(/^\*\*[^*\n]+:\*\*\n*/, "");
      const result = classifyFidelity(message.content, rebuilt);
      report.fidelity[result.class] += 1;
      if (result.class === "structure") {
        for (const category of result.categories) {
          report.fidelity.structureCategories[category] = (report.fidelity.structureCategories[category] ?? 0) + 1;
        }
      }
    }
  }
}
