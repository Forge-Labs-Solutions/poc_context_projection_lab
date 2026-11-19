import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { artifactEdges, artifacts, projections, resourceBindings } from "../db/schema.js";
import { parseMarkdownSections, parseParagraphsToSentences, type ParsedSection } from "./lab01Service.js";
import {
  applyEdit,
  applySemanticChange,
  type ArtifactRow,
  classifyChange,
  insertArtifact,
  normalizeText,
  orderedChildren,
  parseMeta,
  recordEvent,
  rewriteChildren,
  subtreeOf,
  supersede,
  type Tx,
} from "./lab04Service.js";

// Lab 01.5 — idempotent import. Rules: docs/lab 01.5.md. Identity follows the Lab 04 rule (ADR-004, ADR-005).
// Importing a resource again aligns the new text with the tree that already exists and only touches what changed.

export type ChangeSummary = {
  /** Matched elements with nothing to change. */
  kept: number;
  /** Same FCID, new text or title (Lab 04 `edit`). */
  edited: number;
  /** New FCID that evolves from the old one (Lab 04 `semantic_change`). */
  replaced: number;
  /** Superseded because the new text no longer has them (`remove`). */
  removed: number;
  /** Created because the old tree did not have them. */
  added: number;
  /** Same FCID, new position. */
  moved: number;
  /** Silent updates of source metadata (role, migration source). */
  metadata: number;
};

type Change = { operation: string; fcid: string; type: string; previous?: unknown };
type Ctx = { tx: Tx; summary: ChangeSummary; changes: Change[] };

export class FcidConflictError extends Error {
  constructor(public readonly fcid: string, public readonly reason: string) {
    super("FCID_CONFLICT");
  }
}

function suffix(len: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i += 1) out += chars[bytes[i] % chars.length];
  return out;
}

function newCtx(tx: Tx): Ctx {
  return { tx, summary: { kept: 0, edited: 0, replaced: 0, removed: 0, added: 0, moved: 0, metadata: 0 }, changes: [] };
}

function hasChanges(summary: ChangeSummary): boolean {
  return summary.edited + summary.replaced + summary.removed + summary.added + summary.moved + summary.metadata > 0;
}

/** One summary event per call that changed something. It is the last write, so a failure undoes the whole call. */
function finish(ctx: Ctx, rootFcid: string): void {
  if (!hasChanges(ctx.summary)) return;
  recordEvent(ctx.tx, "reimport", [rootFcid], [rootFcid], { changes: ctx.changes }, { ...ctx.summary });
}

// ---------- desired tree (from the text) ----------

type Desired = { type: "SS" | "PG" | "SN"; key: string; meta: Record<string, unknown> | null; children: Desired[] };

function paragraphNode(sentences: string[]): Desired {
  return {
    type: "PG",
    key: normalizeText(sentences.join(" ")),
    meta: null,
    children: sentences.map((text) => ({ type: "SN" as const, key: normalizeText(text), meta: { text }, children: [] })),
  };
}

function sectionNode(section: ParsedSection): Desired {
  return {
    type: "SS",
    key: `${section.level}|${normalizeText(section.title)}`,
    meta: { title: section.title, level: section.level },
    children: section.children.map((child) =>
      child.kind === "section" ? sectionNode(child.section) : paragraphNode(child.paragraph.sentences),
    ),
  };
}

/** The same mapping the Lab 01 import uses: text before the first heading as PG, then one SS per heading (ADR-016). */
export function desiredFromText(text: string): Desired[] {
  const { preamble, sections } = parseMarkdownSections(text);
  if (sections.length === 0) return parseParagraphsToSentences(text).map(paragraphNode);
  return [...preamble.map((paragraph) => paragraphNode(paragraph.sentences)), ...sections.map(sectionNode)];
}

// ---------- existing tree ----------

type Existing = { fcid: string; type: string; key: string; meta: Record<string, unknown>; children: Existing[] };

function readNodes(tx: Tx, parentFcid: string): Existing[] {
  return orderedChildren(tx, parentFcid).map((fcid) => {
    const row = tx.select().from(artifacts).where(eq(artifacts.fcid, fcid)).get() as ArtifactRow;
    const meta = parseMeta(row);
    const children = readNodes(tx, fcid);
    let key: string;
    if (row.type === "SN") key = normalizeText(String(meta.text ?? ""));
    else if (row.type === "SS") key = `${meta.level ?? 1}|${normalizeText(String(meta.title ?? ""))}`;
    else key = normalizeText(children.filter((c) => c.type === "SN").map((c) => String(c.meta.text ?? "")).join(" "));
    return { fcid, type: row.type, key, meta, children };
  });
}

// ---------- alignment ----------

/** Above this many cells the middle part is not aligned by LCS; it falls back to positional pairing. */
const LCS_CELL_LIMIT = 4_000_000;

/** Longest common subsequence of two key lists, after trimming the common prefix and suffix. */
function lcsAnchors(a: string[], b: string[]): Array<[number, number]> {
  let lo = 0;
  while (lo < a.length && lo < b.length && a[lo] === b[lo]) lo += 1;
  let ha = a.length;
  let hb = b.length;
  while (ha > lo && hb > lo && a[ha - 1] === b[hb - 1]) {
    ha -= 1;
    hb -= 1;
  }

  const anchors: Array<[number, number]> = [];
  for (let k = 0; k < lo; k += 1) anchors.push([k, k]);

  const n = ha - lo;
  const m = hb - lo;
  if (n > 0 && m > 0 && n * m <= LCS_CELL_LIMIT) {
    const width = m + 1;
    const table = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        table[i * width + j] =
          a[lo + i] === b[lo + j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[lo + i] === b[lo + j]) {
        anchors.push([lo + i, lo + j]);
        i += 1;
        j += 1;
      } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) i += 1;
      else j += 1;
    }
  }

  const tail = a.length - ha;
  for (let k = 0; k < tail; k += 1) anchors.push([ha + k, hb + k]);
  return anchors;
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let k = from; k < to; k += 1) out.push(k);
  return out;
}

// ---------- operations on one element ----------

function createNode(ctx: Ctx, node: Desired): string {
  const fcid = insertArtifact(ctx.tx, node.type, node.meta);
  if (node.children.length > 0) {
    rewriteChildren(
      ctx.tx,
      fcid,
      node.children.map((child) => createNode(ctx, child)),
    );
  }
  return fcid;
}

function removeNode(ctx: Ctx, node: Existing): void {
  const descendants = subtreeOf(ctx.tx, node.fcid);
  supersede(ctx.tx, [node.fcid, ...descendants]);
  recordEvent(ctx.tx, "remove", [node.fcid], [], { type: node.type, meta: node.meta, descendants }, null);
  ctx.summary.removed += 1;
  ctx.changes.push({ operation: "remove", fcid: node.fcid, type: node.type, previous: node.meta });
}

function editSentence(ctx: Ctx, node: Existing, text: string): void {
  applyEdit(ctx.tx, { fcid: node.fcid, text });
  ctx.summary.edited += 1;
  ctx.changes.push({ operation: "edit", fcid: node.fcid, type: "SN", previous: node.meta.text });
}

/** Title and level of an SS. Returns whether anything changed. */
function updateSection(ctx: Ctx, node: Existing, wanted: Desired): boolean {
  let changed = false;
  const title = String(wanted.meta?.title ?? "");
  if (String(node.meta.title ?? "") !== title) {
    applyEdit(ctx.tx, { fcid: node.fcid, title });
    ctx.summary.edited += 1;
    ctx.changes.push({ operation: "edit", fcid: node.fcid, type: "SS", previous: node.meta.title });
    changed = true;
  }
  const level = wanted.meta?.level;
  if (node.meta.level !== level) {
    const row = ctx.tx.select().from(artifacts).where(eq(artifacts.fcid, node.fcid)).get() as ArtifactRow;
    ctx.tx
      .update(artifacts)
      .set({ metadataJson: JSON.stringify({ ...parseMeta(row), level }), updatedAt: new Date() })
      .where(eq(artifacts.fcid, node.fcid))
      .run();
    ctx.summary.edited += 1;
    ctx.changes.push({ operation: "level", fcid: node.fcid, type: "SS", previous: node.meta.level });
    changed = true;
  }
  return changed;
}

/** Same type and same normalized key: the element stays, and its text or children may still differ. */
function matchSame(ctx: Ctx, old: Existing, wanted: Desired, moved: boolean): string {
  let direct = false;
  if (old.type === "SN") {
    const text = String(wanted.meta?.text ?? "");
    if (String(old.meta.text ?? "") !== text) {
      editSentence(ctx, old, text);
      direct = true;
    }
  } else if (old.type === "SS") {
    direct = updateSection(ctx, old, wanted);
  }
  if (old.children.length > 0 || wanted.children.length > 0) reconcile(ctx, old.fcid, old.children, wanted.children);
  if (moved) ctx.summary.moved += 1;
  else if (!direct) ctx.summary.kept += 1;
  return old.fcid;
}

/** Two different elements of the same type in the same gap: the old one becomes the new one (Lab 04 rule). */
function pairNodes(ctx: Ctx, old: Existing, wanted: Desired): string {
  if (old.type === "SN") {
    const before = String(old.meta.text ?? "");
    const after = String(wanted.meta?.text ?? "");
    if (classifyChange(before, after).suggestion === "edit") {
      editSentence(ctx, old, after);
      return old.fcid;
    }
    const result = applySemanticChange(ctx.tx, { fcid: old.fcid, text: after });
    ctx.summary.replaced += 1;
    ctx.changes.push({ operation: "semantic_change", fcid: result.fcid, type: "SN", previous: before });
    return result.fcid;
  }
  if (old.type === "SS") updateSection(ctx, old, wanted);
  reconcile(ctx, old.fcid, old.children, wanted.children);
  return old.fcid;
}

/**
 * Brings the children of `parentFcid` to the wanted list and returns their FCIDs in order.
 * 1. equal keys stay (LCS); 2. what is left between two anchors is paired by position and type;
 * 3. what is still left is matched by key anywhere (moved); 4. the rest is removed or created.
 */
function reconcile(ctx: Ctx, parentFcid: string, oldNodes: Existing[], newNodes: Desired[]): string[] {
  const oldKeys = oldNodes.map((n) => `${n.type}:${n.key}`);
  const newKeys = newNodes.map((n) => `${n.type}:${n.key}`);
  const anchors = lcsAnchors(oldKeys, newKeys);

  const result: Array<string | null> = new Array(newNodes.length).fill(null);
  const usedOld = new Set<number>();

  for (const [i, j] of anchors) {
    result[j] = matchSame(ctx, oldNodes[i], newNodes[j], false);
    usedOld.add(i);
  }

  const bounds: Array<[number, number]> = [[-1, -1], ...anchors, [oldNodes.length, newNodes.length]];
  for (let g = 0; g < bounds.length - 1; g += 1) {
    const oldGap = range(bounds[g][0] + 1, bounds[g + 1][0]);
    const newGap = range(bounds[g][1] + 1, bounds[g + 1][1]);
    for (let k = 0; k < Math.min(oldGap.length, newGap.length); k += 1) {
      if (oldNodes[oldGap[k]].type !== newNodes[newGap[k]].type) break;
      result[newGap[k]] = pairNodes(ctx, oldNodes[oldGap[k]], newNodes[newGap[k]]);
      usedOld.add(oldGap[k]);
    }
  }

  for (let j = 0; j < newNodes.length; j += 1) {
    if (result[j] !== null) continue;
    const i = oldKeys.findIndex((key, index) => !usedOld.has(index) && key === newKeys[j]);
    if (i < 0) continue;
    result[j] = matchSame(ctx, oldNodes[i], newNodes[j], true);
    usedOld.add(i);
  }

  oldNodes.forEach((node, i) => {
    if (!usedOld.has(i)) removeNode(ctx, node);
  });
  for (let j = 0; j < newNodes.length; j += 1) {
    if (result[j] !== null) continue;
    result[j] = createNode(ctx, newNodes[j]);
    ctx.summary.added += 1;
  }

  const fcids = result as string[];
  const current = orderedChildren(ctx.tx, parentFcid);
  if (current.length !== fcids.length || current.some((fcid, index) => fcid !== fcids[index])) {
    rewriteChildren(ctx.tx, parentFcid, fcids);
  }
  return fcids;
}

function syncBody(ctx: Ctx, rootFcid: string, text: string): void {
  reconcile(ctx, rootFcid, readNodes(ctx.tx, rootFcid), desiredFromText(text));
}

// ---------- projections and parents ----------

/** One projection per resource: an active one is kept, a removed one is reactivated (same id), otherwise one is created. */
function ensureProjection(tx: Tx, input: { rootFcid: string; kind: "document" | "chat"; sourceRef: string; title: string }): string {
  const rows = tx
    .select()
    .from(projections)
    .where(and(eq(projections.rootFcid, input.rootFcid), eq(projections.kind, input.kind)))
    .all()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const active = rows.find((row) => row.status === "active");
  const target = active ?? rows[rows.length - 1];
  if (target) {
    const meta = target.metadataJson ? (JSON.parse(target.metadataJson) as Record<string, unknown>) : {};
    const patch: Partial<typeof projections.$inferInsert> = {};
    if (target.status !== "active") patch.status = "active";
    if (meta.title !== input.title) patch.metadataJson = JSON.stringify({ ...meta, title: input.title });
    if (Object.keys(patch).length > 0) {
      tx.update(projections).set({ ...patch, updatedAt: new Date() }).where(eq(projections.projectionId, target.projectionId)).run();
    }
    return target.projectionId;
  }
  const projectionId = `PROJ_${suffix(8)}`;
  tx.insert(projections)
    .values({
      projectionId,
      kind: input.kind,
      rootFcid: input.rootFcid,
      sourceRef: input.sourceRef,
      status: "active",
      metadataJson: JSON.stringify({ title: input.title }),
    })
    .run();
  return projectionId;
}

/** A resource has one structural parent. An explicit parent moves it; without one the current parent stays. */
function ensureParent(tx: Tx, childFcid: string, parentFcid: string, explicit: boolean): void {
  const edges = tx
    .select()
    .from(artifactEdges)
    .where(and(eq(artifactEdges.childFcid, childFcid), eq(artifactEdges.relationType, "contains")))
    .all();
  const already = edges.some((edge) => edge.parentFcid === parentFcid);
  if (already && edges.length === 1) return;
  if (!already && edges.length > 0 && !explicit) return;
  tx.delete(artifactEdges).where(and(eq(artifactEdges.childFcid, childFcid), eq(artifactEdges.relationType, "contains"))).run();
  tx.insert(artifactEdges).values({ parentFcid, childFcid, relationType: "contains", orderIndex: Date.now() }).run();
}

/** The projection of a chat created without messages (`createChat`): reused when it exists, reactivated when removed. */
export function ensureChatProjection(input: { chatFcid: string; resourceKey: string; title: string }): string {
  return db.transaction((tx) =>
    ensureProjection(tx, { rootFcid: input.chatFcid, kind: "chat", sourceRef: input.resourceKey, title: input.title }),
  );
}

// ---------- document ----------

export function reimportDocument(input: {
  rootFcid: string;
  resourceKey: string;
  title: string;
  text: string;
  parentFcid: string;
  explicitParent: boolean;
}): { projectionId: string; summary: ChangeSummary } {
  return db.transaction((tx) => {
    const ctx = newCtx(tx);
    syncBody(ctx, input.rootFcid, input.text);
    ensureParent(tx, input.rootFcid, input.parentFcid, input.explicitParent);
    const projectionId = ensureProjection(tx, {
      rootFcid: input.rootFcid,
      kind: "document",
      sourceRef: input.resourceKey,
      title: input.title,
    });
    finish(ctx, input.rootFcid);
    return { projectionId, summary: ctx.summary };
  });
}

// ---------- chat ----------

export type ChatMessageInput = {
  /** Identity of the message in the source. Without it messages are matched by position and role. */
  fcid?: string;
  role: string;
  text: string;
  /** Source fields kept next to `role` in the message metadata. */
  metadata?: Record<string, unknown>;
};

export type ImportChatInput = {
  resourceKey: string;
  title: string;
  messages: ChatMessageInput[];
  /** Identity of the chat in the source; adopted when the chat is created. */
  chatFcid?: string;
  metadata?: Record<string, unknown>;
};

export type ImportChatResult = {
  chatFcid: string;
  projectionId: string;
  messageFcids: string[];
  created: boolean;
  summary: ChangeSummary;
};

function metaDiffers(current: Record<string, unknown>, wanted: Record<string, unknown>): boolean {
  return Object.keys(wanted).some((key) => JSON.stringify(current[key]) !== JSON.stringify(wanted[key]));
}

function syncMetadata(ctx: Ctx, fcid: string, wanted: Record<string, unknown>): void {
  const row = ctx.tx.select().from(artifacts).where(eq(artifacts.fcid, fcid)).get() as ArtifactRow;
  const current = parseMeta(row);
  if (!metaDiffers(current, wanted)) return;
  ctx.tx
    .update(artifacts)
    .set({ metadataJson: JSON.stringify({ ...current, ...wanted }), updatedAt: new Date() })
    .where(eq(artifacts.fcid, fcid))
    .run();
  ctx.summary.metadata += 1;
  ctx.changes.push({ operation: "metadata", fcid, type: row.type, previous: Object.fromEntries(Object.keys(wanted).map((k) => [k, current[k]])) });
}

function createMessage(ctx: Ctx, message: ChatMessageInput): string {
  const fcid = insertArtifact(ctx.tx, "MS", { role: message.role, ...(message.metadata ?? {}) }, message.fcid);
  rewriteChildren(
    ctx.tx,
    fcid,
    desiredFromText(message.text).map((node) => createNode(ctx, node)),
  );
  return fcid;
}

function syncMessages(ctx: Ctx, chatFcid: string, messages: ChatMessageInput[]): string[] {
  const withFcid = messages.filter((m) => m.fcid !== undefined).length;
  if (withFcid !== 0 && withFcid !== messages.length) throw new Error("MIXED_MESSAGE_IDENTITY");

  const existing = orderedChildren(ctx.tx, chatFcid).map((fcid) => {
    const row = ctx.tx.select().from(artifacts).where(eq(artifacts.fcid, fcid)).get() as ArtifactRow;
    return { fcid, type: row.type, meta: parseMeta(row), key: "", children: [] as Existing[] };
  });
  const result: string[] = [];
  const used = new Set<string>();

  messages.forEach((message, index) => {
    const wanted = { role: message.role, ...(message.metadata ?? {}) };
    let match: (typeof existing)[number] | undefined;
    if (message.fcid !== undefined) {
      match = existing.find((e) => e.fcid === message.fcid);
      if (!match && ctx.tx.select().from(artifacts).where(eq(artifacts.fcid, message.fcid)).get()) {
        throw new FcidConflictError(message.fcid, "The FCID already exists outside this chat");
      }
    } else {
      const candidate = existing[index];
      if (candidate && candidate.meta.role === message.role) match = candidate;
    }

    if (!match) {
      result.push(createMessage(ctx, message));
      ctx.summary.added += 1;
      return;
    }
    used.add(match.fcid);
    syncMetadata(ctx, match.fcid, wanted);
    const before = { ...ctx.summary };
    syncBody(ctx, match.fcid, message.text);
    const touched = (Object.keys(before) as Array<keyof ChangeSummary>).some((key) => key !== "kept" && ctx.summary[key] !== before[key]);
    if (!touched) ctx.summary.kept += 1;
    result.push(match.fcid);
  });

  existing.forEach((node) => {
    if (!used.has(node.fcid)) removeNode(ctx, { ...node, children: [] });
  });

  const current = orderedChildren(ctx.tx, chatFcid);
  if (current.length !== result.length || current.some((fcid, index) => fcid !== result[index])) {
    rewriteChildren(ctx.tx, chatFcid, result);
  }
  return result;
}

/**
 * Creates the chat or brings an existing one to the given conversation, in one transaction. Messages with an
 * `fcid` are matched by it; without, by position and role. The chat hangs from the workspace (ADR-021).
 */
export function importChat(input: ImportChatInput): ImportChatResult {
  return db.transaction((tx) => {
    const ctx = newCtx(tx);
    const binding = tx
      .select()
      .from(resourceBindings)
      .where(and(eq(resourceBindings.resourceKey, input.resourceKey), eq(resourceBindings.artifactType, "CH")))
      .get();

    let chatFcid: string;
    let created = false;
    if (binding) {
      chatFcid = binding.artifactFcid;
      if (input.chatFcid !== undefined && input.chatFcid !== chatFcid) {
        throw new FcidConflictError(input.chatFcid, `The key ${input.resourceKey} already belongs to ${chatFcid}`);
      }
      if (input.metadata) syncMetadata(ctx, chatFcid, input.metadata);
    } else {
      if (input.chatFcid !== undefined && tx.select().from(artifacts).where(eq(artifacts.fcid, input.chatFcid)).get()) {
        throw new FcidConflictError(input.chatFcid, "The FCID already exists");
      }
      chatFcid = insertArtifact(tx, "CH", { resourceKey: input.resourceKey, ...(input.metadata ?? {}) }, input.chatFcid);
      tx.insert(resourceBindings)
        .values({ bindingId: `RB_${suffix(8)}`, resourceKey: input.resourceKey, artifactType: "CH", artifactFcid: chatFcid, projectionKind: "chat" })
        .run();
      created = true;
    }

    const workspace = tx.select().from(artifacts).where(eq(artifacts.type, "WS")).get();
    if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
    tx.insert(artifactEdges)
      .values({ parentFcid: workspace.fcid, childFcid: chatFcid, relationType: "contains", orderIndex: Date.now() })
      .onConflictDoNothing()
      .run();

    const messageFcids = syncMessages(ctx, chatFcid, input.messages);
    const projectionId = ensureProjection(tx, { rootFcid: chatFcid, kind: "chat", sourceRef: input.resourceKey, title: input.title });
    if (!created) finish(ctx, chatFcid);
    return { chatFcid, projectionId, messageFcids, created, summary: ctx.summary };
  });
}
