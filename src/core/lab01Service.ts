import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  artifactEdges,
  artifacts,
  projections,
  referencesTable,
  resourceBindings,
} from "../db/schema.js";
import { type ChangeSummary, ensureChatProjection, reimportDocument } from "./lab015Service.js";

const STRUCTURAL_TYPES = new Set(["WS", "PJ", "DR", "DC", "CH", "MS", "SS", "PG"]);

type ArtifactType = "WS" | "PJ" | "DR" | "DC" | "CH" | "MS" | "SS" | "PG" | "SN";

function randomSuffix(len = 6): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

async function createFcid(type: ArtifactType): Promise<string> {
  for (let i = 0; i < 20; i += 1) {
    const fcid = `${type}_${randomSuffix(6)}`;
    const exists = await db.select({ fcid: artifacts.fcid }).from(artifacts).where(eq(artifacts.fcid, fcid)).limit(1);
    if (exists.length === 0) {
      return fcid;
    }
  }
  throw new Error("Unable to generate unique FCID");
}

export async function ensureArtifact(type: ArtifactType, metadata?: Record<string, unknown>): Promise<string> {
  const fcid = await createFcid(type);
  await db.insert(artifacts).values({
    fcid,
    type,
    category: STRUCTURAL_TYPES.has(type) ? "structural" : "cognitive",
    state: "active",
    metadataJson: metadata ? JSON.stringify(metadata) : null,
  });
  return fcid;
}

async function ensureBinding(resourceKey: string, artifactType: ArtifactType, projectionKind: string): Promise<string> {
  const existing = await db
    .select()
    .from(resourceBindings)
    .where(and(eq(resourceBindings.resourceKey, resourceKey), eq(resourceBindings.artifactType, artifactType)))
    .limit(1);
  if (existing.length > 0) return existing[0].artifactFcid;

  const artifactFcid = await ensureArtifact(artifactType, { resourceKey });
  await db.insert(resourceBindings).values({
    bindingId: `RB_${randomSuffix(8)}`,
    resourceKey,
    artifactType,
    artifactFcid,
    projectionKind,
  });
  return artifactFcid;
}

async function link(parentFcid: string, childFcid: string, orderIndex = 0): Promise<void> {
  await db.insert(artifactEdges).values({
    parentFcid,
    childFcid,
    relationType: "contains",
    orderIndex,
  }).onConflictDoNothing();
}

export async function createChat(resourceKey: string, title: string): Promise<{ chatFcid: string; projectionId: string }> {
  const chatFcid = await ensureBinding(resourceKey, "CH", "chat");
  // ADR-021: a chat hangs from the workspace, like a document imported without a parent.
  await link(await resolveWorkspaceFcid(), chatFcid, Date.now());
  // Creating the same chat again reuses its projection (Lab 01.5).
  const projectionId = ensureChatProjection({ chatFcid, resourceKey, title });
  return { chatFcid, projectionId };
}

export async function importDocument(input: {
  resourceKey: string;
  title: string;
  text: string;
  parentFcid?: string;
}): Promise<{ rootFcid: string; projectionId: string; reimport: ChangeSummary | null }> {
  const parentFcid = await resolveParentForImport(input.parentFcid);

  // Lab 01.5: a resource that is already bound is brought to the new text instead of being mapped again.
  const bound = await db
    .select()
    .from(resourceBindings)
    .where(and(eq(resourceBindings.resourceKey, input.resourceKey), eq(resourceBindings.artifactType, "DC")))
    .limit(1);
  if (bound[0]) {
    const result = reimportDocument({
      rootFcid: bound[0].artifactFcid,
      resourceKey: input.resourceKey,
      title: input.title,
      text: input.text,
      parentFcid,
      explicitParent: input.parentFcid !== undefined,
    });
    return { rootFcid: bound[0].artifactFcid, projectionId: result.projectionId, reimport: result.summary };
  }

  const rootFcid = await ensureBinding(input.resourceKey, "DC", "document");
  const projectionId = `PROJ_${randomSuffix(8)}`;
  await db.insert(projections).values({
    projectionId,
    kind: "document",
    rootFcid,
    sourceRef: input.resourceKey,
    status: "active",
    metadataJson: JSON.stringify({ title: input.title }),
  });

  await link(parentFcid, rootFcid, Date.now());

  if (!(await persistMarkdownBody(rootFcid, input.text))) {
    const paragraphs = parseParagraphsToSentences(input.text);
    for (let p = 0; p < paragraphs.length; p += 1) {
      const pg = await ensureArtifact("PG");
      await link(rootFcid, pg, p);
      for (let n = 0; n < paragraphs[p].length; n += 1) {
        const sn = await ensureArtifact("SN", { text: paragraphs[p][n] });
        await link(pg, sn, n);
      }
    }
  }

  return { rootFcid, projectionId, reimport: null };
}

export async function importDirectory(input: {
  title: string;
  parentFcid?: string;
  documents: Array<{ resourceKey: string; title: string; text: string }>;
}): Promise<{
  directoryFcid: string;
  parentFcid: string;
  documents: Array<{ rootFcid: string; projectionId: string; reimport: ChangeSummary | null }>;
}> {
  const parentFcid = await resolveParentForImport(input.parentFcid);

  // Lab 01.5: a directory is identified by its parent and exact title, so importing it again reuses it.
  let directoryFcid = await findDirectory(parentFcid, input.title);
  if (!directoryFcid) {
    directoryFcid = await ensureArtifact("DR", { title: input.title });
    await link(parentFcid, directoryFcid, Date.now());
  }

  const importedDocs: Array<{ rootFcid: string; projectionId: string; reimport: ChangeSummary | null }> = [];
  for (const doc of input.documents) {
    const imported = await importDocument({
      ...doc,
      parentFcid: directoryFcid,
    });
    importedDocs.push(imported);
  }

  return { directoryFcid, parentFcid, documents: importedDocs };
}

async function findDirectory(parentFcid: string, title: string): Promise<string | null> {
  const edges = await db
    .select()
    .from(artifactEdges)
    .where(and(eq(artifactEdges.parentFcid, parentFcid), eq(artifactEdges.relationType, "contains")));
  for (const edge of edges) {
    const child = await db.select().from(artifacts).where(eq(artifacts.fcid, edge.childFcid)).limit(1);
    if (!child[0] || child[0].type !== "DR" || child[0].state !== "active") continue;
    try {
      const meta = child[0].metadataJson ? (JSON.parse(child[0].metadataJson) as Record<string, unknown>) : {};
      if (meta.title === title) return child[0].fcid;
    } catch {
      // A directory with unreadable metadata is not a match.
    }
  }
  return null;
}

async function resolveWorkspaceFcid(): Promise<string> {
  const ws = await db.select().from(artifacts).where(eq(artifacts.type, "WS")).limit(1);
  if (!ws[0]) throw new Error("WORKSPACE_NOT_FOUND");
  return ws[0].fcid;
}

async function resolveParentForImport(parentFcid?: string): Promise<string> {
  if (!parentFcid) return resolveWorkspaceFcid();
  const parent = await db.select().from(artifacts).where(eq(artifacts.fcid, parentFcid)).limit(1);
  if (!parent[0]) throw new Error("INVALID_PARENT");
  if (!["PJ", "DR"].includes(parent[0].type)) throw new Error("INVALID_PARENT");
  return parent[0].fcid;
}

export async function addMessageToChat(
  chatFcid: string,
  input: { role: "user" | "assistant" | "system"; text: string },
): Promise<{ messageFcid: string }> {
  const chat = await db.select().from(artifacts).where(eq(artifacts.fcid, chatFcid)).limit(1);
  if (chat.length === 0 || chat[0].type !== "CH") {
    throw new Error("CHAT_NOT_FOUND");
  }

  const msg = await ensureArtifact("MS", { role: input.role });
  await link(chatFcid, msg, Date.now());
  await persistMessageContent(msg, input.text);
  return { messageFcid: msg };
}

export async function persistMessageContent(msgFcid: string, text: string): Promise<void> {
  if (await persistMarkdownBody(msgFcid, text)) return;
  const paragraphs = parseParagraphsToSentences(text);
  for (let p = 0; p < paragraphs.length; p += 1) {
    const pg = await ensureArtifact("PG");
    await link(msgFcid, pg, p);
    for (let n = 0; n < paragraphs[p].length; n += 1) {
      const sn = await ensureArtifact("SN", { text: paragraphs[p][n] });
      await link(pg, sn, n);
    }
  }
}

export type ParsedParagraph = { sentences: string[] };
export type ParsedSectionBlock =
  | { kind: "paragraph"; paragraph: ParsedParagraph }
  | { kind: "section"; section: ParsedSection };

export type ParsedSection = {
  title: string;
  level: number;
  children: ParsedSectionBlock[];
};

/**
 * Persists a markdown body under a DC or MS: text before the first heading becomes PG children, in order,
 * followed by one SS per top-level heading (ADR-016). Returns false when the text has no headings, so the
 * caller maps it as plain paragraphs.
 */
async function persistMarkdownBody(parentFcid: string, text: string): Promise<boolean> {
  const { preamble, sections } = parseMarkdownSections(text);
  if (sections.length === 0) return false;

  let orderIndex = 0;
  for (const paragraph of preamble) {
    const pg = await ensureArtifact("PG");
    await link(parentFcid, pg, orderIndex);
    for (let n = 0; n < paragraph.sentences.length; n += 1) {
      const sn = await ensureArtifact("SN", { text: paragraph.sentences[n] });
      await link(pg, sn, n);
    }
    orderIndex += 1;
  }
  for (const section of sections) {
    await persistSection(section, parentFcid, orderIndex);
    orderIndex += 1;
  }
  return true;
}

async function persistSection(section: ParsedSection, parentFcid: string, orderIndex: number): Promise<string> {
  const ss = await ensureArtifact("SS", { title: section.title, level: section.level });
  await link(parentFcid, ss, orderIndex);

  for (let i = 0; i < section.children.length; i += 1) {
    const child = section.children[i];
    if (child.kind === "section") {
      await persistSection(child.section, ss, i);
      continue;
    }

    const pg = await ensureArtifact("PG");
    await link(ss, pg, i);
    for (let n = 0; n < child.paragraph.sentences.length; n += 1) {
      const sn = await ensureArtifact("SN", { text: child.paragraph.sentences[n] });
      await link(pg, sn, n);
    }
  }

  return ss;
}

export function parseMarkdownSections(text: string): { preamble: ParsedParagraph[]; sections: ParsedSection[] } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const roots: ParsedSection[] = [];
  const preamble: ParsedParagraph[] = [];
  const stack: ParsedSection[] = [];
  let buffer: string[] = [];

  const flushParagraph = (): void => {
    const paragraph = buffer.join(" ").trim();
    const current = stack[stack.length - 1];
    if (paragraph.length > 0) {
      const parsed = { sentences: splitSentences(paragraph) };
      // Text before the first heading has no section to live in; it is kept as the preamble.
      if (current) current.children.push({ kind: "paragraph", paragraph: parsed });
      else preamble.push(parsed);
    }
    buffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const level = rawLine.match(/^#{1,6}/)?.[0].length ?? 1;
      const section: ParsedSection = {
        title: heading[1].trim(),
        level,
        children: [],
      };

      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      const parent = stack[stack.length - 1];
      if (parent) {
        parent.children.push({ kind: "section", section });
      } else {
        roots.push(section);
      }
      stack.push(section);
      continue;
    }
    if (line.length === 0) {
      flushParagraph();
      continue;
    }
    buffer.push(line);
  }

  flushParagraph();
  return { preamble, sections: roots };
}

export function parseParagraphsToSentences(text: string): string[][] {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/g)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (paragraphs.length === 0) return [[text.trim()].filter(Boolean)];
  return paragraphs.map((p) => splitSentences(p));
}

function splitSentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function removeProjection(projectionId: string): Promise<boolean> {
  const row = await db.select().from(projections).where(eq(projections.projectionId, projectionId)).limit(1);
  if (row.length === 0) return false;

  // Lab 01.5: the binding stays, so importing the same resource again reuses the same artifact (and FCID).
  // A resource whose projections are all removed does not resolve by name (see lab03Service).
  await db.update(projections).set({ status: "removed", updatedAt: new Date() }).where(eq(projections.projectionId, projectionId));
  return true;
}

export async function artifactExplorer(fcid?: string): Promise<unknown> {
  if (fcid) {
    const nodes = await db.select().from(artifacts).where(eq(artifacts.fcid, fcid)).limit(1);
    if (nodes.length === 0) return null;
    const parents = await db.select().from(artifactEdges).where(eq(artifactEdges.childFcid, fcid));
    const children = await db.select().from(artifactEdges).where(eq(artifactEdges.parentFcid, fcid));
    const refs = await db.select().from(referencesTable).where(eq(referencesTable.sourceFcid, fcid));
    return { ...nodes[0], parent: parents.map((p) => p.parentFcid), children: children.map((c) => c.childFcid), references: refs };
  }

  const nodes = await db.select().from(artifacts);
  const edges = await db.select().from(artifactEdges);
  const refs = await db.select().from(referencesTable);
  return nodes.map((n) => ({
    ...n,
    parent: edges.filter((e) => e.childFcid === n.fcid).map((e) => e.parentFcid),
    children: edges.filter((e) => e.parentFcid === n.fcid).map((e) => e.childFcid),
    references: refs.filter((r) => r.sourceFcid === n.fcid),
  }));
}

type TreeNode = {
  fcid: string;
  type: string;
  category: string;
  state: string;
  metadataJson: string | null;
  parent: string[];
  references: unknown[];
  children: TreeNode[];
};

export async function artifactExplorerTree(): Promise<{ roots: TreeNode[]; stats: { totalNodes: number; rootCount: number } }> {
  const [nodes, edges, refs] = await Promise.all([
    db.select().from(artifacts),
    db.select().from(artifactEdges),
    db.select().from(referencesTable),
  ]);

  const nodeByFcid = new Map(nodes.map((n) => [n.fcid, n]));
  const parentsByChild = new Map<string, string[]>();
  const refsBySource = new Map<string, unknown[]>();
  for (const r of refs) {
    const current = refsBySource.get(r.sourceFcid) ?? [];
    current.push(r);
    refsBySource.set(r.sourceFcid, current);
  }

  const childrenByParent = new Map<string, Array<{ childFcid: string; orderIndex: number }>>();
  for (const edge of edges) {
    const children = childrenByParent.get(edge.parentFcid) ?? [];
    children.push({ childFcid: edge.childFcid, orderIndex: edge.orderIndex });
    childrenByParent.set(edge.parentFcid, children);

    const parents = parentsByChild.get(edge.childFcid) ?? [];
    parents.push(edge.parentFcid);
    parentsByChild.set(edge.childFcid, parents);
  }

  for (const arr of childrenByParent.values()) {
    arr.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  const buildNode = (fcid: string, visiting: Set<string>): TreeNode => {
    if (visiting.has(fcid)) {
      const artifact = nodeByFcid.get(fcid);
      return {
        fcid,
        type: artifact?.type ?? "UNKNOWN",
        category: artifact?.category ?? "structural",
        state: artifact?.state ?? "active",
        metadataJson: artifact?.metadataJson ?? null,
        parent: parentsByChild.get(fcid) ?? [],
        references: refsBySource.get(fcid) ?? [],
        children: [],
      };
    }

    visiting.add(fcid);
    const artifact = nodeByFcid.get(fcid);
    const children = (childrenByParent.get(fcid) ?? [])
      .filter((edge) => nodeByFcid.has(edge.childFcid))
      .map((edge) => buildNode(edge.childFcid, visiting));
    visiting.delete(fcid);

    return {
      fcid,
      type: artifact?.type ?? "UNKNOWN",
      category: artifact?.category ?? "structural",
      state: artifact?.state ?? "active",
      metadataJson: artifact?.metadataJson ?? null,
      parent: parentsByChild.get(fcid) ?? [],
      references: refsBySource.get(fcid) ?? [],
      children,
    };
  };

  // Superseded artifacts (Lab 04) leave the structural graph; they are reachable only through lineage.
  const rootFcids = nodes
    .filter((node) => node.state !== "superseded")
    .filter((node) => (parentsByChild.get(node.fcid) ?? []).length === 0)
    .map((node) => node.fcid);

  const roots = rootFcids.map((fcid) => buildNode(fcid, new Set<string>()));

  return {
    roots,
    stats: {
      totalNodes: nodes.length,
      rootCount: roots.length,
    },
  };
}

export async function validateProjection(projectionId: string): Promise<unknown> {
  const projection = await db.select().from(projections).where(eq(projections.projectionId, projectionId)).limit(1);
  if (projection.length === 0) return null;
  const root = await db.select().from(artifacts).where(eq(artifacts.fcid, projection[0].rootFcid)).limit(1);
  const rootChildren = await db.select().from(artifactEdges).where(eq(artifactEdges.parentFcid, projection[0].rootFcid));
  return {
    projectionId,
    checks: {
      hasPersistentRootFcid: !!root[0],
      separatesStructureAndContent: rootChildren.length > 0,
      projectionIsNotSourceOfTruth: projection[0].status === "active" || projection[0].status === "removed",
    },
  };
}
