import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, like, or } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  artifactEdges,
  artifactLineage,
  artifacts,
  evolutionEvents,
  referencesTable,
} from "../db/schema.js";
import { ensureArtifact, persistMessageContent } from "./lab01Service.js";

// Lab 04 — Evolution & Lineage. Rules: docs/lab 04.md, ADR-004 and ADR-005.

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type ArtifactRow = typeof artifacts.$inferSelect;
type EdgeRow = typeof artifactEdges.$inferSelect;

export type EvolutionOperation = "edit" | "semantic_change" | "split" | "merge" | "regenerate" | "remove" | "reimport";
export type LineageRelation = "evolves_from" | "split_from" | "merged_from";

export type Lab04ErrorCode =
  | "NOT_FOUND"
  | "SUPERSEDED"
  | "INVALID_OPERATION"
  | "NO_CHANGE"
  | "CONTENT_CHANGED"
  | "NO_PARENT"
  | "DIFFERENT_PARENTS"
  | "NOT_ADJACENT";

export class Lab04Error extends Error {
  constructor(
    public readonly code: Lab04ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

const CONTAINS = "contains";
const SPLITTABLE = new Set(["SN", "PG", "MS"]);
const MAX_TYPO_DISTANCE = 2;

// ---------- helpers ----------

function randomSuffix(len: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i += 1) out += chars[bytes[i] % chars.length];
  return out;
}

export function parseMeta(row: ArtifactRow): Record<string, unknown> {
  if (!row.metadataJson) return {};
  try {
    return JSON.parse(row.metadataJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function newFcid(tx: Tx, type: string): string {
  for (let i = 0; i < 20; i += 1) {
    const fcid = `${type}_${randomSuffix(6)}`;
    const exists = tx.select({ fcid: artifacts.fcid }).from(artifacts).where(eq(artifacts.fcid, fcid)).get();
    if (!exists) return fcid;
  }
  throw new Error("Unable to generate unique FCID");
}

/** `fixedFcid` adopts an existing identity (Lab 01.5 migration); without it a new FCID is generated. */
export function insertArtifact(tx: Tx, type: string, metadata: Record<string, unknown> | null, fixedFcid?: string): string {
  const fcid = fixedFcid ?? newFcid(tx, type);
  tx.insert(artifacts).values({
    fcid,
    type,
    category: type === "SN" ? "cognitive" : "structural",
    state: "active",
    metadataJson: metadata ? JSON.stringify(metadata) : null,
  }).run();
  return fcid;
}

function getArtifact(tx: Tx, fcid: string): ArtifactRow {
  const row = tx.select().from(artifacts).where(eq(artifacts.fcid, fcid)).get();
  if (!row) throw new Lab04Error("NOT_FOUND", `Artifact ${fcid} not found`);
  return row;
}

export function getActive(tx: Tx, fcid: string): ArtifactRow {
  const row = getArtifact(tx, fcid);
  if (row.state === "superseded") {
    throw new Lab04Error("SUPERSEDED", `Artifact ${fcid} is superseded`, { fcid, current: currentOf(tx, fcid) });
  }
  return row;
}

function parentEdge(tx: Tx, fcid: string): EdgeRow | undefined {
  return tx
    .select()
    .from(artifactEdges)
    .where(and(eq(artifactEdges.childFcid, fcid), eq(artifactEdges.relationType, CONTAINS)))
    .get();
}

export function orderedChildren(tx: Tx, parentFcid: string): string[] {
  return tx
    .select()
    .from(artifactEdges)
    .where(and(eq(artifactEdges.parentFcid, parentFcid), eq(artifactEdges.relationType, CONTAINS)))
    .all()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((e) => e.childFcid);
}

/** Every artifact below `rootFcid` through `contains` edges, parents before children. */
export function subtreeOf(tx: Tx, rootFcid: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>([rootFcid]);
  const queue = [rootFcid];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const child of orderedChildren(tx, current)) {
      if (seen.has(child)) continue;
      seen.add(child);
      result.push(child);
      queue.push(child);
    }
  }
  return result;
}

/** Replaces all `contains` children of a parent, renumbering orderIndex from 0. */
export function rewriteChildren(tx: Tx, parentFcid: string, childFcids: string[]): void {
  tx.delete(artifactEdges)
    .where(and(eq(artifactEdges.parentFcid, parentFcid), eq(artifactEdges.relationType, CONTAINS)))
    .run();
  if (childFcids.length === 0) return;
  tx.insert(artifactEdges)
    .values(childFcids.map((childFcid, orderIndex) => ({ parentFcid, childFcid, relationType: CONTAINS, orderIndex })))
    .run();
}

/**
 * Removes contiguous `oldFcids` from their parent and puts `newFcids` in their place (ADR-005).
 * Callers must validate that oldFcids are adjacent siblings.
 */
function replaceInParent(tx: Tx, oldFcids: string[], newFcids: string[]): string {
  const edge = parentEdge(tx, oldFcids[0]);
  if (!edge) throw new Lab04Error("NO_PARENT", `Artifact ${oldFcids[0]} has no structural parent`);
  const siblings = orderedChildren(tx, edge.parentFcid);
  const position = siblings.indexOf(oldFcids[0]);
  const next = siblings.filter((f) => !oldFcids.includes(f));
  next.splice(position, 0, ...newFcids);
  rewriteChildren(tx, edge.parentFcid, next);
  return edge.parentFcid;
}

export function supersede(tx: Tx, fcids: string[]): void {
  for (const fcid of fcids) {
    tx.update(artifacts).set({ state: "superseded", updatedAt: new Date() }).where(eq(artifacts.fcid, fcid)).run();
  }
}

export function recordEvent(
  tx: Tx,
  operation: EvolutionOperation,
  inputs: string[],
  outputs: string[],
  before: unknown,
  after: unknown,
): string {
  const eventId = `EVT_${randomSuffix(8)}`;
  tx.insert(evolutionEvents).values({
    eventId,
    operation,
    inputsJson: JSON.stringify(inputs),
    outputsJson: JSON.stringify(outputs),
    beforeJson: JSON.stringify(before),
    afterJson: JSON.stringify(after),
  }).run();
  return eventId;
}

export function addLineage(tx: Tx, descendantFcid: string, ancestorFcid: string, relationType: LineageRelation, eventId: string): void {
  tx.insert(artifactLineage).values({ descendantFcid, ancestorFcid, relationType, eventId }).run();
}

function currentOf(tx: Tx, fcid: string): string[] {
  const root = getArtifact(tx, fcid);
  if (root.state !== "superseded") return [fcid];

  const result: string[] = [];
  const seen = new Set<string>();
  const queue = [fcid];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (seen.has(current)) continue;
    seen.add(current);
    const descendants = tx.select().from(artifactLineage).where(eq(artifactLineage.ancestorFcid, current)).all();
    for (const d of descendants) {
      const row = getArtifact(tx, d.descendantFcid);
      if (row.state === "superseded") queue.push(row.fcid);
      else if (!result.includes(row.fcid)) result.push(row.fcid);
    }
  }
  return result;
}

// ---------- classifier ----------

export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const curr = [i];
    for (let j = 1; j <= b.length; j += 1) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = curr;
  }
  return prev[b.length];
}

function isTypo(a: string, b: string): boolean {
  if (a === b) return true;
  const d = levenshtein(a, b);
  return d <= MAX_TYPO_DISTANCE && d * 2 < Math.max(a.length, b.length);
}

export type Classification = {
  suggestion: "edit" | "semantic_change";
  reason: "identical_after_normalization" | "token_level_typos" | "content_changed";
  similarity: number;
};

/** Suggestion only. The declared operation is the source of truth (ADR-004). */
export function classifyChange(before: string, after: string): Classification {
  const nb = normalizeText(before);
  const na = normalizeText(after);
  const maxLen = Math.max(nb.length, na.length, 1);
  const similarity = Math.round((1 - levenshtein(nb, na) / maxLen) * 1000) / 1000;
  if (nb === na) return { suggestion: "edit", reason: "identical_after_normalization", similarity };

  const tb = nb.split(" ");
  const ta = na.split(" ");
  if (tb.length === ta.length && tb.every((t, i) => isTypo(t, ta[i]))) {
    return { suggestion: "edit", reason: "token_level_typos", similarity };
  }
  return { suggestion: "semantic_change", reason: "content_changed", similarity };
}

export function classifyArtifactChange(fcid: string, text: string): Classification & { fcid: string; before: string; after: string } {
  return db.transaction((tx) => {
    const row = getActive(tx, fcid);
    if (row.type !== "SN") throw new Lab04Error("INVALID_OPERATION", "Classification is only supported for SN");
    const before = String(parseMeta(row).text ?? "");
    return { fcid, before, after: text, ...classifyChange(before, text) };
  });
}

// ---------- operations ----------

export type EditResult = {
  fcid: string;
  revision: number;
  eventId: string;
  classification?: Classification;
};

export function editArtifact(input: { fcid: string; text?: string; title?: string }): EditResult {
  return db.transaction((tx) => applyEdit(tx, input));
}

/** The body of `editArtifact` for callers that already hold a transaction (Lab 01.5). */
export function applyEdit(tx: Tx, input: { fcid: string; text?: string; title?: string }): EditResult {
  const row = getActive(tx, input.fcid);
  const meta = parseMeta(row);
  const revision = Number(meta.revision ?? 1) + 1;

  let field: "text" | "title";
  let value: string | undefined;
  if (row.type === "SN") {
    field = "text";
    value = input.text;
  } else if (row.type === "SS") {
    field = "title";
    value = input.title;
  } else {
    throw new Lab04Error("INVALID_OPERATION", `Edit is not supported for ${row.type}`);
  }
  if (value === undefined || (field === "text" ? input.title : input.text) !== undefined) {
    throw new Lab04Error("INVALID_OPERATION", `Edit of ${row.type} requires only "${field}"`);
  }

  const previous = String(meta[field] ?? "");
  if (previous === value) throw new Lab04Error("NO_CHANGE", "New value is identical to the current one");

  tx.update(artifacts)
    .set({ metadataJson: JSON.stringify({ ...meta, [field]: value, revision }), updatedAt: new Date() })
    .where(eq(artifacts.fcid, row.fcid))
    .run();
  const eventId = recordEvent(
    tx,
    "edit",
    [row.fcid],
    [row.fcid],
    { [field]: previous, revision: revision - 1 },
    { [field]: value, revision },
  );

  return {
    fcid: row.fcid,
    revision,
    eventId,
    ...(field === "text" ? { classification: classifyChange(previous, value) } : {}),
  };
}

export type SemanticChangeResult = {
  fcid: string;
  supersededFcid: string;
  eventId: string;
  classification: Classification;
};

export function semanticChange(input: { fcid: string; text: string }): SemanticChangeResult {
  return db.transaction((tx) => applySemanticChange(tx, input));
}

/** The body of `semanticChange` for callers that already hold a transaction (Lab 01.5). */
export function applySemanticChange(tx: Tx, input: { fcid: string; text: string }): SemanticChangeResult {
  const row = getActive(tx, input.fcid);
  if (row.type !== "SN") throw new Lab04Error("INVALID_OPERATION", "Semantic change is only supported for SN");
  const previous = String(parseMeta(row).text ?? "");
  if (previous === input.text) throw new Lab04Error("NO_CHANGE", "New text is identical to the current one");

  const fcid = insertArtifact(tx, "SN", { text: input.text, revision: 1 });
  replaceInParent(tx, [row.fcid], [fcid]);
  supersede(tx, [row.fcid]);
  const eventId = recordEvent(tx, "semantic_change", [row.fcid], [fcid], { text: previous }, { text: input.text });
  addLineage(tx, fcid, row.fcid, "evolves_from", eventId);

  return { fcid, supersededFcid: row.fcid, eventId, classification: classifyChange(previous, input.text) };
}

export function splitArtifact(input: { fcid: string; parts?: string[]; boundaries?: number[] }): {
  supersededFcid: string;
  fcids: string[];
  eventId: string;
} {
  return db.transaction((tx) => {
    const row = getActive(tx, input.fcid);
    if (!SPLITTABLE.has(row.type)) throw new Lab04Error("INVALID_OPERATION", `Split is not supported for ${row.type}`);
    if (!parentEdge(tx, row.fcid)) throw new Lab04Error("NO_PARENT", `Artifact ${row.fcid} has no structural parent`);

    let fcids: string[];
    let before: unknown;
    let after: unknown;

    if (row.type === "SN") {
      const parts = input.parts?.map((p) => p.trim());
      if (!parts || parts.length < 2 || parts.some((p) => p.length === 0) || input.boundaries) {
        throw new Lab04Error("INVALID_OPERATION", "Split of SN requires at least 2 non-empty \"parts\"");
      }
      const original = String(parseMeta(row).text ?? "");
      if (normalizeText(parts.join(" ")) !== normalizeText(original)) {
        throw new Lab04Error("CONTENT_CHANGED", "Parts must preserve the original content", {
          original: normalizeText(original),
          parts: normalizeText(parts.join(" ")),
        });
      }
      fcids = parts.map((text) => insertArtifact(tx, "SN", { text, revision: 1 }));
      before = { text: original };
      after = { parts: fcids.map((fcid, i) => ({ fcid, text: parts[i] })) };
    } else {
      const boundaries = input.boundaries;
      const children = orderedChildren(tx, row.fcid);
      if (!boundaries || input.parts) {
        throw new Lab04Error("INVALID_OPERATION", `Split of ${row.type} requires "boundaries"`);
      }
      const valid = boundaries.every((b, i) => Number.isInteger(b) && b > 0 && b < children.length && (i === 0 || b > boundaries[i - 1]));
      if (!valid) {
        throw new Lab04Error("INVALID_OPERATION", `Boundaries must be strictly increasing integers between 1 and ${children.length - 1}`);
      }
      const cuts = [0, ...boundaries, children.length];
      const groups = cuts.slice(0, -1).map((start, i) => children.slice(start, cuts[i + 1]));
      const meta = row.type === "MS" ? { role: parseMeta(row).role } : {};
      fcids = groups.map((group) => {
        const fcid = insertArtifact(tx, row.type, meta);
        rewriteChildren(tx, fcid, group);
        return fcid;
      });
      rewriteChildren(tx, row.fcid, []);
      before = { children };
      after = { parts: fcids.map((fcid, i) => ({ fcid, children: groups[i] })) };
    }

    replaceInParent(tx, [row.fcid], fcids);
    supersede(tx, [row.fcid]);
    const eventId = recordEvent(tx, "split", [row.fcid], fcids, before, after);
    for (const fcid of fcids) addLineage(tx, fcid, row.fcid, "split_from", eventId);

    return { supersededFcid: row.fcid, fcids, eventId };
  });
}

export function mergeArtifacts(input: { fcids: string[] }): {
  fcid: string;
  supersededFcids: string[];
  eventId: string;
} {
  return db.transaction((tx) => {
    const unique = [...new Set(input.fcids)];
    if (unique.length < 2) throw new Lab04Error("INVALID_OPERATION", "Merge requires at least 2 distinct artifacts");

    const rows = unique.map((fcid) => getActive(tx, fcid));
    const type = rows[0].type;
    if (!SPLITTABLE.has(type) || rows.some((r) => r.type !== type)) {
      throw new Lab04Error("INVALID_OPERATION", "Merge requires artifacts of the same type (SN, PG or MS)");
    }

    const edges = rows.map((r) => parentEdge(tx, r.fcid));
    if (edges.some((e) => !e)) throw new Lab04Error("NO_PARENT", "All artifacts must have a structural parent");
    const parentFcid = (edges[0] as EdgeRow).parentFcid;
    if (edges.some((e) => (e as EdgeRow).parentFcid !== parentFcid)) {
      throw new Lab04Error("DIFFERENT_PARENTS", "Merge requires artifacts with the same parent");
    }

    const siblings = orderedChildren(tx, parentFcid);
    const ordered = [...rows].sort((a, b) => siblings.indexOf(a.fcid) - siblings.indexOf(b.fcid));
    const first = siblings.indexOf(ordered[0].fcid);
    if (ordered.some((r, i) => siblings.indexOf(r.fcid) !== first + i)) {
      throw new Lab04Error("NOT_ADJACENT", "Merge requires adjacent siblings");
    }

    let fcid: string;
    let before: unknown;
    let after: unknown;
    if (type === "SN") {
      const texts = ordered.map((r) => String(parseMeta(r).text ?? ""));
      const text = texts.join(" ");
      fcid = insertArtifact(tx, "SN", { text, revision: 1 });
      before = { parts: ordered.map((r, i) => ({ fcid: r.fcid, text: texts[i] })) };
      after = { text };
    } else {
      const roles = new Set(ordered.map((r) => parseMeta(r).role));
      if (type === "MS" && roles.size > 1) throw new Lab04Error("INVALID_OPERATION", "Merge of MS requires the same role");
      const groups = ordered.map((r) => orderedChildren(tx, r.fcid));
      fcid = insertArtifact(tx, type, type === "MS" ? { role: parseMeta(ordered[0]).role } : {});
      for (const r of ordered) rewriteChildren(tx, r.fcid, []);
      const children = groups.flat();
      rewriteChildren(tx, fcid, children);
      before = { parts: ordered.map((r, i) => ({ fcid: r.fcid, children: groups[i] })) };
      after = { children };
    }

    const supersededFcids = ordered.map((r) => r.fcid);
    replaceInParent(tx, supersededFcids, [fcid]);
    supersede(tx, supersededFcids);
    const eventId = recordEvent(tx, "merge", supersededFcids, [fcid], before, after);
    for (const old of supersededFcids) addLineage(tx, fcid, old, "merged_from", eventId);

    return { fcid, supersededFcids, eventId };
  });
}

export async function regenerateMessage(input: { fcid: string; text: string }): Promise<{
  fcid: string;
  supersededFcid: string;
  eventId: string;
}> {
  const role = db.transaction((tx) => {
    const row = getActive(tx, input.fcid);
    if (row.type !== "MS") throw new Lab04Error("INVALID_OPERATION", "Regenerate is only supported for MS");
    if (!parentEdge(tx, row.fcid)) throw new Lab04Error("NO_PARENT", `Artifact ${row.fcid} has no structural parent`);
    return parseMeta(row).role;
  });

  // Content is built with the Lab 01 mapper (async), then swapped in atomically.
  // POC limitation: if the swap fails, the new MS stays orphaned.
  const fcid = await ensureArtifact("MS", { role });
  await persistMessageContent(fcid, input.text);

  return db.transaction((tx) => {
    const row = getActive(tx, input.fcid);
    const previousChildren = orderedChildren(tx, row.fcid);
    // Unlike split and merge, regenerate leaves the old content attached to the old message. It must be
    // superseded with it, or those sentences stay active (ADR-015): they would be drawn by the Lab 06 pool
    // and could still be edited.
    const descendants = subtreeOf(tx, row.fcid);
    replaceInParent(tx, [row.fcid], [fcid]);
    supersede(tx, [row.fcid, ...descendants]);
    const eventId = recordEvent(
      tx,
      "regenerate",
      [row.fcid],
      [fcid],
      { role, children: previousChildren, descendants },
      { role, text: input.text },
    );
    addLineage(tx, fcid, row.fcid, "evolves_from", eventId);
    return { fcid, supersededFcid: row.fcid, eventId };
  });
}

// ---------- queries ----------

type LineageStep = { fcid: string; relation: string; via: string; eventId: string; depth: number; state: string };

function walk(tx: Tx, fcid: string, direction: "up" | "down"): LineageStep[] {
  const steps: LineageStep[] = [];
  const seen = new Set<string>();
  const queue: Array<{ fcid: string; depth: number }> = [{ fcid, depth: 0 }];
  while (queue.length > 0) {
    const { fcid: current, depth } = queue.shift() as { fcid: string; depth: number };
    const rows = tx
      .select()
      .from(artifactLineage)
      .where(direction === "up" ? eq(artifactLineage.descendantFcid, current) : eq(artifactLineage.ancestorFcid, current))
      .all();
    for (const r of rows) {
      const next = direction === "up" ? r.ancestorFcid : r.descendantFcid;
      const key = `${next}|${r.relationType}|${current}`;
      if (seen.has(key)) continue;
      seen.add(key);
      steps.push({ fcid: next, relation: r.relationType, via: current, eventId: r.eventId, depth: depth + 1, state: getArtifact(tx, next).state });
      queue.push({ fcid: next, depth: depth + 1 });
    }
  }
  return steps;
}

function parseJson(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function getLineage(fcid: string): unknown {
  return db.transaction((tx) => {
    const row = getArtifact(tx, fcid);
    const pattern = `%"${fcid}"%`;
    const events = tx
      .select()
      .from(evolutionEvents)
      .where(or(like(evolutionEvents.inputsJson, pattern), like(evolutionEvents.outputsJson, pattern)))
      .orderBy(asc(evolutionEvents.createdAt))
      .all()
      .map((e) => ({
        eventId: e.eventId,
        operation: e.operation,
        inputs: parseJson(e.inputsJson),
        outputs: parseJson(e.outputsJson),
        before: parseJson(e.beforeJson),
        after: parseJson(e.afterJson),
        createdAt: e.createdAt,
      }));
    return {
      fcid,
      type: row.type,
      state: row.state,
      ancestors: walk(tx, fcid, "up"),
      descendants: walk(tx, fcid, "down"),
      current: currentOf(tx, fcid),
      events,
    };
  });
}

export type Supersession = {
  eventId: string;
  operation: string;
  /** The artifact the event replaced: the queried FCID itself, or the ancestor whose subtree held it (regenerate). */
  supersededRoot: string;
  /** What the event produced. Container-level hints, not a one-to-one mapping for the descendants. */
  replacedBy: string[];
};

/** The latest event that retired `fcid`, directly or as part of a replaced subtree. Null if none is recorded. */
export function findSupersession(fcid: string): Supersession | null {
  const pattern = `%"${fcid}"%`;
  const row = db
    .select()
    .from(evolutionEvents)
    .where(or(like(evolutionEvents.inputsJson, pattern), like(evolutionEvents.beforeJson, pattern)))
    .orderBy(desc(evolutionEvents.createdAt))
    .limit(1)
    .get();
  if (!row) return null;
  const inputs = parseJson(row.inputsJson);
  const outputs = parseJson(row.outputsJson);
  const inputList = Array.isArray(inputs) ? (inputs as string[]) : [];
  return {
    eventId: row.eventId,
    operation: row.operation,
    supersededRoot: inputList.includes(fcid) ? fcid : (inputList[0] ?? fcid),
    replacedBy: Array.isArray(outputs) ? (outputs as string[]) : [],
  };
}

export function getCurrentFcids(fcid: string): { fcid: string; state: string; current: string[] } {
  return db.transaction((tx) => {
    const row = getArtifact(tx, fcid);
    return { fcid, state: row.state, current: currentOf(tx, fcid) };
  });
}

export function resolveReferenceContinuity(referenceId: string): {
  referenceId: string;
  fcasRaw: string;
  targetFcid: string;
  status: "resolved" | "evolved" | "ambiguous" | "orphaned";
  currentFcids: string[];
} {
  return db.transaction((tx) => {
    const ref = tx.select().from(referencesTable).where(eq(referencesTable.referenceId, referenceId)).get();
    if (!ref) throw new Lab04Error("NOT_FOUND", `Reference ${referenceId} not found`);
    const target = getArtifact(tx, ref.targetFcid);
    const currentFcids = currentOf(tx, target.fcid);
    const status =
      target.state !== "superseded"
        ? "resolved"
        : currentFcids.length === 1
          ? "evolved"
          : currentFcids.length === 0
            ? "orphaned"
            : "ambiguous";
    return { referenceId, fcasRaw: ref.fcasRaw, targetFcid: ref.targetFcid, status, currentFcids };
  });
}
