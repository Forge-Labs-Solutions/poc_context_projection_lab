import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { artifactEdges, artifacts, projections, referencesTable, resourceBindings } from "../db/schema.js";
import { findSupersession, getCurrentFcids } from "./lab04Service.js";

// FCAS syntax: ADR-017. Reference ids: ADR-018. Orphaned targets: ADR-019.

export type MessageRange = { from: number; to: number };

export type ParsedFcas =
  | { kind: "artifact"; raw: string; artifactFcid: string }
  | { kind: "document"; raw: string; documentKey: string; sectionTitle?: string }
  | { kind: "chat"; raw: string; chatKey: string; messageIndex?: number; messageRange?: MessageRange }
  | { kind: "workspace"; raw: string }
  | { kind: "project"; raw: string; projectName: string }
  | { kind: "directory"; raw: string; directoryName: string }
  | { kind: "concept"; raw: string; slug: string; section?: string }
  | { kind: "alias"; raw: string; name: string };

function randomSuffix(len = 8): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i += 1) out += chars[bytes[i] % chars.length];
  return out;
}

function unwrapFcas(fcas: string): string {
  const trimmed = fcas.trim();
  const m = trimmed.match(/^\[\[(.+)\]\]$/);
  if (!m) throw new Error("FCAS_INVALID");
  return m[1].trim();
}

function parseInner(inner: string, raw: string): ParsedFcas {
  if (/^[A-Z]{2}_[A-Z0-9]{2,}$/.test(inner)) {
    return { kind: "artifact", raw, artifactFcid: inner };
  }
  if (inner === "$workspace") return { kind: "workspace", raw };
  if (inner.startsWith("$")) return { kind: "project", raw, projectName: inner.slice(1) };

  const conceptMatch = inner.match(/^#([a-z0-9-]+)(?:#(.+))?$/i);
  if (conceptMatch) {
    return {
      kind: "concept",
      raw,
      slug: conceptMatch[1].toLowerCase(),
      ...(conceptMatch[2] ? { section: conceptMatch[2].trim() } : {}),
    };
  }

  const aliasMatch = inner.match(/^@([a-z0-9_-]+)$/i);
  if (aliasMatch) return { kind: "alias", raw, name: aliasMatch[1] };

  const chatMatch = inner.match(/^::([^<]+)(?:<(\d+)(?:-(\d+))?>)?$/);
  if (chatMatch) {
    const chatKey = `::${chatMatch[1]}`;
    if (chatMatch[3] !== undefined) {
      const from = Number(chatMatch[2]);
      const to = Number(chatMatch[3]);
      if (from < 1 || to < from) throw new Error("FCAS_INVALID");
      return { kind: "chat", raw, chatKey, messageRange: { from, to } };
    }
    return { kind: "chat", raw, chatKey, messageIndex: chatMatch[2] ? Number(chatMatch[2]) : undefined };
  }

  const docMatch = inner.match(/^([^#]+\.md)(?:#(.+))?$/i);
  if (docMatch) {
    return {
      kind: "document",
      raw,
      documentKey: docMatch[1],
      sectionTitle: docMatch[2]?.trim(),
    };
  }

  return { kind: "directory", raw, directoryName: inner };
}

export function parseFcas(fcas: string): ParsedFcas {
  const inner = unwrapFcas(fcas);
  return parseInner(inner, fcas);
}

/** A resource whose projections were all removed keeps its binding (Lab 01.5) but does not resolve by name. */
async function isRemoved(artifactFcid: string): Promise<boolean> {
  const rows = await db.select().from(projections).where(eq(projections.rootFcid, artifactFcid));
  return rows.length > 0 && rows.every((row) => row.status === "removed");
}

async function findBinding(resourceKey: string, artifactType: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(resourceBindings)
    .where(and(eq(resourceBindings.resourceKey, resourceKey), eq(resourceBindings.artifactType, artifactType)))
    .limit(1);
  const fcid = rows[0]?.artifactFcid ?? null;
  return fcid !== null && (await isRemoved(fcid)) ? null : fcid;
}

/** The resource key of a bound artifact, unless the resource was removed. */
async function boundKeyOf(artifactFcid: string): Promise<string | null> {
  const rows = await db.select().from(resourceBindings).where(eq(resourceBindings.artifactFcid, artifactFcid)).limit(1);
  if (!rows[0]) return null;
  return (await isRemoved(artifactFcid)) ? null : rows[0].resourceKey;
}

async function resolveSectionFromDocument(dcFcid: string, title: string): Promise<string | null> {
  const [edges, nodes] = await Promise.all([
    db.select().from(artifactEdges),
    db.select().from(artifacts),
  ]);
  const nodesMap = new Map(nodes.map((n) => [n.fcid, n]));
  const childrenByParent = new Map<string, string[]>();
  for (const edge of edges) {
    const children = childrenByParent.get(edge.parentFcid) ?? [];
    children.push(edge.childFcid);
    childrenByParent.set(edge.parentFcid, children);
  }

  const normalized = title.trim().toLowerCase();
  const queue = [...(childrenByParent.get(dcFcid) ?? [])];

  while (queue.length > 0) {
    const currentFcid = queue.shift() ?? "";
    const node = nodesMap.get(currentFcid);
    if (!node) continue;
    if (node.type === "SS") {
      try {
        const meta = node.metadataJson ? (JSON.parse(node.metadataJson) as Record<string, unknown>) : {};
        const t = String(meta.title ?? "").trim().toLowerCase();
        if (t === normalized) return node.fcid;
      } catch {
        // ignore bad metadata
      }
      queue.push(...(childrenByParent.get(node.fcid) ?? []));
    }
  }

  return null;
}

async function resolveMessageFromChat(chatFcid: string, index: number): Promise<string | null> {
  const edges = await db.select().from(artifactEdges).where(eq(artifactEdges.parentFcid, chatFcid));
  const messageEdges = [...edges].sort((a, b) => a.orderIndex - b.orderIndex);
  const target = messageEdges[index - 1];
  if (!target) return null;
  const node = await db.select().from(artifacts).where(eq(artifacts.fcid, target.childFcid)).limit(1);
  if (!node[0] || node[0].type !== "MS") return null;
  return node[0].fcid;
}

export class FcasAmbiguousError extends Error {
  constructor(public readonly originalFcid: string, public readonly candidates: string[]) {
    super("FCAS_AMBIGUOUS");
  }
}

/** Two or more directories (or projects) carry the same name (ADR-017). */
export class FcasNameAmbiguousError extends Error {
  constructor(public readonly name: string, public readonly candidates: string[]) {
    super("FCAS_NAME_AMBIGUOUS");
  }
}

/** The target was superseded and nothing active descends from it (ADR-019). */
export class FcasOrphanedError extends Error {
  constructor(
    public readonly originalFcid: string,
    public readonly cause: { eventId: string; operation: string; supersededRoot: string } | null,
    public readonly candidates: string[],
  ) {
    super("FCAS_ORPHANED");
  }
}

/** The syntax is part of the unified FCAS but this POC has nothing to resolve it against (ADR-017). */
export class FcasUnsupportedError extends Error {
  constructor(public readonly syntax: "concept" | "alias") {
    super("FCAS_UNSUPPORTED");
  }
}

function titleOf(row: typeof artifacts.$inferSelect): string | null {
  try {
    const meta = row.metadataJson ? (JSON.parse(row.metadataJson) as Record<string, unknown>) : {};
    const value = meta.title ?? meta.name;
    return typeof value === "string" && value.trim() !== "" ? value : null;
  } catch {
    return null;
  }
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Projects and directories are addressed by name (ADR-017). The name is the `title` in the artifact metadata,
 * compared without case. A project can also be addressed by its FCID. Nothing falls back to "the first one".
 */
async function resolveByName(type: "PJ" | "DR", name: string): Promise<string> {
  const rows = await db.select().from(artifacts).where(and(eq(artifacts.type, type), eq(artifacts.state, "active")));
  const named = rows.filter((row) => {
    const title = titleOf(row);
    return title !== null && sameName(title, name);
  });
  if (named.length === 1) return named[0].fcid;
  if (named.length > 1) throw new FcasNameAmbiguousError(name, named.map((row) => row.fcid));
  if (type === "PJ") {
    const byFcid = rows.find((row) => sameName(row.fcid, name));
    if (byFcid) return byFcid.fcid;
  }
  throw new Error("FCAS_TARGET_NOT_FOUND");
}

export async function resolveFcasToFcid(
  fcas: string,
): Promise<{ parsed: ParsedFcas; targetFcid: string; evolvedFrom?: string; range?: MessageRange }> {
  const parsed = parseFcas(fcas);

  if (parsed.kind === "concept" || parsed.kind === "alias") throw new FcasUnsupportedError(parsed.kind);

  if (parsed.kind === "artifact") {
    const row = await db.select().from(artifacts).where(eq(artifacts.fcid, parsed.artifactFcid)).limit(1);
    if (!row[0]) throw new Error("FCAS_TARGET_NOT_FOUND");
    if (row[0].state !== "superseded") return { parsed, targetFcid: row[0].fcid };

    // Lab 04 (ADR-005): a superseded FCID resolves through lineage to its active descendants.
    const { current } = getCurrentFcids(row[0].fcid);
    if (current.length === 1) return { parsed, targetFcid: current[0], evolvedFrom: row[0].fcid };
    if (current.length === 0) {
      // ADR-019: say why nothing is left, and what replaced the container when the log knows.
      const cause = findSupersession(row[0].fcid);
      throw new FcasOrphanedError(
        row[0].fcid,
        cause ? { eventId: cause.eventId, operation: cause.operation, supersededRoot: cause.supersededRoot } : null,
        cause ? cause.replacedBy : [],
      );
    }
    throw new FcasAmbiguousError(row[0].fcid, current);
  }

  if (parsed.kind === "workspace") {
    const row = await db.select().from(artifacts).where(eq(artifacts.type, "WS")).limit(1);
    if (!row[0]) throw new Error("FCAS_TARGET_NOT_FOUND");
    return { parsed, targetFcid: row[0].fcid };
  }

  if (parsed.kind === "project") {
    return { parsed, targetFcid: await resolveByName("PJ", parsed.projectName) };
  }

  if (parsed.kind === "directory") {
    return { parsed, targetFcid: await resolveByName("DR", parsed.directoryName) };
  }

  if (parsed.kind === "document") {
    const dcFcid = await findBinding(parsed.documentKey, "DC");
    if (!dcFcid) throw new Error("FCAS_TARGET_NOT_FOUND");
    if (!parsed.sectionTitle) return { parsed, targetFcid: dcFcid };
    const ssFcid = await resolveSectionFromDocument(dcFcid, parsed.sectionTitle);
    if (!ssFcid) throw new Error("FCAS_TARGET_NOT_FOUND");
    return { parsed, targetFcid: ssFcid };
  }

  const chFcid = await findBinding(parsed.chatKey, "CH");
  if (!chFcid) throw new Error("FCAS_TARGET_NOT_FOUND");
  // A range is a window of the chat, not an artifact: the caller applies it to the chat (ADR-017).
  if (parsed.messageRange) return { parsed, targetFcid: chFcid, range: parsed.messageRange };
  if (!parsed.messageIndex) return { parsed, targetFcid: chFcid };
  const msFcid = await resolveMessageFromChat(chFcid, parsed.messageIndex);
  if (!msFcid) throw new Error("FCAS_TARGET_NOT_FOUND");
  return { parsed, targetFcid: msFcid };
}

export async function createReferenceArtifact(input: {
  sourceFcid: string;
  fcas: string;
}): Promise<{ referenceId: string; targetFcid: string }> {
  const source = await db.select().from(artifacts).where(eq(artifacts.fcid, input.sourceFcid)).limit(1);
  if (!source[0]) throw new Error("SOURCE_NOT_FOUND");

  const resolved = await resolveFcasToFcid(input.fcas);
  const referenceId = `REF_${randomSuffix(6)}`;
  await db.insert(referencesTable).values({
    referenceId,
    sourceFcid: input.sourceFcid,
    fcasRaw: input.fcas,
    targetFcid: resolved.targetFcid,
    status: "resolved",
  });
  return { referenceId, targetFcid: resolved.targetFcid };
}

export async function projectFcidToFcas(targetFcid: string): Promise<string> {
  const node = await db.select().from(artifacts).where(eq(artifacts.fcid, targetFcid)).limit(1);
  if (!node[0]) throw new Error("FCID_NOT_FOUND");
  const artifact = node[0];

  if (artifact.type === "DC" || artifact.type === "CH") {
    const key = await boundKeyOf(artifact.fcid);
    if (key) return `[[${key}]]`;
  }
  if (artifact.type === "SS") {
    let currentFcid = artifact.fcid;
    while (true) {
      const parentEdge = await db.select().from(artifactEdges).where(eq(artifactEdges.childFcid, currentFcid)).limit(1);
      if (!parentEdge[0]) break;
      const dcKey = await boundKeyOf(parentEdge[0].parentFcid);
      if (dcKey) {
        const title = (() => {
          try {
            const meta = artifact.metadataJson ? (JSON.parse(artifact.metadataJson) as Record<string, unknown>) : {};
            return String(meta.title ?? "Section");
          } catch {
            return "Section";
          }
        })();
        return `[[${dcKey}#${title}]]`;
      }
      currentFcid = parentEdge[0].parentFcid;
    }
  }
  if (artifact.type === "MS") {
    const parentEdge = await db.select().from(artifactEdges).where(eq(artifactEdges.childFcid, artifact.fcid)).limit(1);
    if (parentEdge[0]) {
      const chKey = await boundKeyOf(parentEdge[0].parentFcid);
      if (chKey) {
        const all = await db.select().from(artifactEdges).where(eq(artifactEdges.parentFcid, parentEdge[0].parentFcid));
        const ordered = [...all].sort((a, b) => a.orderIndex - b.orderIndex);
        const index = ordered.findIndex((e) => e.childFcid === artifact.fcid);
        if (index >= 0) return `[[${chKey}<${index + 1}>]]`;
      }
    }
  }
  if (artifact.type === "WS") return "[[$workspace]]";

  // ADR-017: projects and directories keep their name. The name is used only when it still parses as the same
  // kind and resolves without ambiguity (a unique name resolves to this artifact); otherwise the FCID is the
  // safe address.
  if (artifact.type === "PJ" || artifact.type === "DR") {
    const title = titleOf(artifact);
    if (title !== null) {
      const candidate = artifact.type === "PJ" ? `[[$${title.trim()}]]` : `[[${title.trim()}]]`;
      try {
        const roundTrip = await resolveFcasToFcid(candidate);
        if (roundTrip.parsed.kind === (artifact.type === "PJ" ? "project" : "directory")) return candidate;
      } catch {
        // Not unique, or the name parses as another kind: fall through to the FCID.
      }
    }
    if (artifact.type === "PJ") return `[[$${artifact.fcid}]]`;
  }

  return `[[${artifact.fcid}]]`;
}
