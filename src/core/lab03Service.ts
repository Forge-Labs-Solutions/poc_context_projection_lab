import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { artifactEdges, artifacts, referencesTable, resourceBindings } from "../db/schema.js";

type ParsedFcas =
  | { kind: "artifact"; raw: string; artifactFcid: string }
  | { kind: "document"; raw: string; documentKey: string; sectionTitle?: string }
  | { kind: "chat"; raw: string; chatKey: string; messageIndex?: number }
  | { kind: "workspace"; raw: string }
  | { kind: "project"; raw: string; projectName: string }
  | { kind: "directory"; raw: string; directoryName: string };

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

  const chatMatch = inner.match(/^::([^<]+)(?:<(\d+)>)?$/);
  if (chatMatch) {
    return {
      kind: "chat",
      raw,
      chatKey: `::${chatMatch[1]}`,
      messageIndex: chatMatch[2] ? Number(chatMatch[2]) : undefined,
    };
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

async function findBinding(resourceKey: string, artifactType: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(resourceBindings)
    .where(and(eq(resourceBindings.resourceKey, resourceKey), eq(resourceBindings.artifactType, artifactType)))
    .limit(1);
  return rows[0]?.artifactFcid ?? null;
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

export async function resolveFcasToFcid(fcas: string): Promise<{ parsed: ParsedFcas; targetFcid: string }> {
  const parsed = parseFcas(fcas);

  if (parsed.kind === "artifact") {
    const row = await db.select().from(artifacts).where(eq(artifacts.fcid, parsed.artifactFcid)).limit(1);
    if (!row[0]) throw new Error("FCAS_TARGET_NOT_FOUND");
    return { parsed, targetFcid: row[0].fcid };
  }

  if (parsed.kind === "workspace") {
    const row = await db.select().from(artifacts).where(eq(artifacts.type, "WS")).limit(1);
    if (!row[0]) throw new Error("FCAS_TARGET_NOT_FOUND");
    return { parsed, targetFcid: row[0].fcid };
  }

  if (parsed.kind === "project") {
    const row = await db.select().from(artifacts).where(eq(artifacts.type, "PJ")).limit(1);
    if (!row[0]) throw new Error("FCAS_TARGET_NOT_FOUND");
    return { parsed, targetFcid: row[0].fcid };
  }

  if (parsed.kind === "directory") {
    const row = await db.select().from(artifacts).where(eq(artifacts.type, "DR")).limit(1);
    if (!row[0]) throw new Error("FCAS_TARGET_NOT_FOUND");
    return { parsed, targetFcid: row[0].fcid };
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
  const referenceId = `RF_${randomSuffix(8)}`;
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

  if (artifact.type === "DC") {
    const binding = await db.select().from(resourceBindings).where(eq(resourceBindings.artifactFcid, artifact.fcid)).limit(1);
    if (binding[0]) return `[[${binding[0].resourceKey}]]`;
  }
  if (artifact.type === "CH") {
    const binding = await db.select().from(resourceBindings).where(eq(resourceBindings.artifactFcid, artifact.fcid)).limit(1);
    if (binding[0]) return `[[${binding[0].resourceKey}]]`;
  }
  if (artifact.type === "SS") {
    let currentFcid = artifact.fcid;
    while (true) {
      const parentEdge = await db.select().from(artifactEdges).where(eq(artifactEdges.childFcid, currentFcid)).limit(1);
      if (!parentEdge[0]) break;
      const dcBinding = await db.select().from(resourceBindings).where(eq(resourceBindings.artifactFcid, parentEdge[0].parentFcid)).limit(1);
      if (dcBinding[0]) {
        const title = (() => {
          try {
            const meta = artifact.metadataJson ? (JSON.parse(artifact.metadataJson) as Record<string, unknown>) : {};
            return String(meta.title ?? "Section");
          } catch {
            return "Section";
          }
        })();
        return `[[${dcBinding[0].resourceKey}#${title}]]`;
      }
      currentFcid = parentEdge[0].parentFcid;
    }
  }
  if (artifact.type === "MS") {
    const parentEdge = await db.select().from(artifactEdges).where(eq(artifactEdges.childFcid, artifact.fcid)).limit(1);
    if (parentEdge[0]) {
      const chBinding = await db.select().from(resourceBindings).where(eq(resourceBindings.artifactFcid, parentEdge[0].parentFcid)).limit(1);
      if (chBinding[0]) {
        const all = await db.select().from(artifactEdges).where(eq(artifactEdges.parentFcid, parentEdge[0].parentFcid));
        const ordered = [...all].sort((a, b) => a.orderIndex - b.orderIndex);
        const index = ordered.findIndex((e) => e.childFcid === artifact.fcid);
        if (index >= 0) return `[[${chBinding[0].resourceKey}<${index + 1}>]]`;
      }
    }
  }
  if (artifact.type === "WS") return "[[$workspace]]";
  if (artifact.type === "PJ") return "[[$ForgeOS]]";

  return `[[${artifact.fcid}]]`;
}
