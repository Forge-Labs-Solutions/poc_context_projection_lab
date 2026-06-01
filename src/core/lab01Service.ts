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

async function ensureArtifact(type: ArtifactType, metadata?: Record<string, unknown>): Promise<string> {
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
  const projectionId = `PROJ_${randomSuffix(8)}`;
  await db.insert(projections).values({
    projectionId,
    kind: "chat",
    rootFcid: chatFcid,
    sourceRef: resourceKey,
    status: "active",
    metadataJson: JSON.stringify({ title }),
  });
  return { chatFcid, projectionId };
}

export async function importDocument(input: {
  resourceKey: string;
  title: string;
  text: string;
}): Promise<{ rootFcid: string; projectionId: string }> {
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

  const markdownSections = parseMarkdownSections(input.text);
  if (markdownSections.length > 0) {
    for (let s = 0; s < markdownSections.length; s += 1) {
      const ss = await ensureArtifact("SS", { title: markdownSections[s].title });
      await link(rootFcid, ss, s);
      for (let p = 0; p < markdownSections[s].paragraphs.length; p += 1) {
        const pg = await ensureArtifact("PG");
        await link(ss, pg, p);
        for (let n = 0; n < markdownSections[s].paragraphs[p].sentences.length; n += 1) {
          const sn = await ensureArtifact("SN", { text: markdownSections[s].paragraphs[p].sentences[n] });
          await link(pg, sn, n);
        }
      }
    }
  } else {
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

  return { rootFcid, projectionId };
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

  const markdownSections = parseMarkdownSections(input.text);
  if (markdownSections.length > 0) {
    for (let s = 0; s < markdownSections.length; s += 1) {
      const ss = await ensureArtifact("SS", { title: markdownSections[s].title });
      await link(msg, ss, s);
      for (let p = 0; p < markdownSections[s].paragraphs.length; p += 1) {
        const pg = await ensureArtifact("PG");
        await link(ss, pg, p);
        for (let n = 0; n < markdownSections[s].paragraphs[p].sentences.length; n += 1) {
          const sn = await ensureArtifact("SN", { text: markdownSections[s].paragraphs[p].sentences[n] });
          await link(pg, sn, n);
        }
      }
    }
  } else {
    const paragraphs = parseParagraphsToSentences(input.text);
    for (let p = 0; p < paragraphs.length; p += 1) {
      const pg = await ensureArtifact("PG");
      await link(msg, pg, p);
      for (let n = 0; n < paragraphs[p].length; n += 1) {
        const sn = await ensureArtifact("SN", { text: paragraphs[p][n] });
        await link(pg, sn, n);
      }
    }
  }
  return { messageFcid: msg };
}

function parseMarkdownSections(text: string): Array<{ title: string; paragraphs: Array<{ sentences: string[] }> }> {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections: Array<{ title: string; paragraphs: string[] }> = [];
  let current: { title: string; paragraphs: string[] } | null = null;
  let buffer: string[] = [];

  const flushParagraph = (): void => {
    const paragraph = buffer.join(" ").trim();
    if (paragraph.length > 0 && current) current.paragraphs.push(paragraph);
    buffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      flushParagraph();
      if (current) sections.push(current);
      current = { title: heading[1].trim(), paragraphs: [] };
      continue;
    }
    if (!current) continue;
    if (line.length === 0) {
      flushParagraph();
      continue;
    }
    buffer.push(line);
  }

  flushParagraph();
  if (current) sections.push(current);

  return sections.map((s) => ({
    title: s.title,
    paragraphs: s.paragraphs.map((p) => ({ sentences: splitSentences(p) })),
  }));
}

function parseParagraphsToSentences(text: string): string[][] {
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

  await db.update(projections).set({ status: "removed" }).where(eq(projections.projectionId, projectionId));
  await db.delete(resourceBindings).where(and(
    eq(resourceBindings.resourceKey, row[0].sourceRef ?? ""),
    eq(resourceBindings.projectionKind, row[0].kind),
  ));
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
