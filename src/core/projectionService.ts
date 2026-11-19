import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { artifactEdges, artifacts } from "../db/schema.js";
import type { ProjectionFormat } from "./lab02Schemas.js";

type SupportedScope = "SN" | "PG" | "SS" | "MS" | "DC" | "CH";
type RenderedProjection = {
  artifactFcid: string;
  scope: SupportedScope;
  targetFormat: ProjectionFormat;
  content?: string;
  structured?: unknown;
  lineageMeta: { statelessRebuild: true };
};

type ArtifactRow = typeof artifacts.$inferSelect;
type EdgeRow = typeof artifactEdges.$inferSelect;

const PROJECTABLE_TYPES = new Set<SupportedScope>(["SN", "PG", "SS", "MS", "DC", "CH"]);

function parseMetadataJson(metadataJson: string | null): Record<string, unknown> {
  if (!metadataJson) return {};
  try {
    return JSON.parse(metadataJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function sortByOrderIndex(edges: EdgeRow[]): EdgeRow[] {
  return [...edges].sort((a, b) => a.orderIndex - b.orderIndex);
}

export async function loadArtifactWithGraph(rootFcid: string): Promise<{
  root: ArtifactRow | null;
  nodesMap: Map<string, ArtifactRow>;
  childrenMap: Map<string, EdgeRow[]>;
}> {
  const [rootRows, allNodes, allEdges] = await Promise.all([
    db.select().from(artifacts).where(eq(artifacts.fcid, rootFcid)).limit(1),
    db.select().from(artifacts),
    db.select().from(artifactEdges),
  ]);
  const root = rootRows[0] ?? null;
  const nodesMap = new Map(allNodes.map((n) => [n.fcid, n]));
  const childrenMap = new Map<string, EdgeRow[]>();
  for (const edge of allEdges) {
    if (!childrenMap.has(edge.parentFcid)) childrenMap.set(edge.parentFcid, []);
    childrenMap.get(edge.parentFcid)?.push(edge);
  }
  for (const [k, v] of childrenMap.entries()) {
    childrenMap.set(k, sortByOrderIndex(v));
  }
  return { root, nodesMap, childrenMap };
}

function projectSN(node: ArtifactRow): { markdown: string; text: string; json: unknown } {
  const metadata = parseMetadataJson(node.metadataJson);
  const text = String(metadata.text ?? "");
  return {
    markdown: text,
    text,
    json: { type: "SN", fcid: node.fcid, text },
  };
}

function projectPG(
  node: ArtifactRow,
  nodesMap: Map<string, ArtifactRow>,
  childrenMap: Map<string, EdgeRow[]>,
): { markdown: string; text: string; json: unknown } {
  const edges = childrenMap.get(node.fcid) ?? [];
  const sentences: string[] = [];
  const structured = [];
  for (const edge of edges) {
    const child = nodesMap.get(edge.childFcid);
    if (!child || child.type !== "SN") continue;
    const sn = projectSN(child);
    sentences.push(sn.text);
    structured.push(sn.json);
  }
  return {
    markdown: sentences.join(" "),
    text: sentences.join(" "),
    json: { type: "PG", fcid: node.fcid, sentences: structured },
  };
}

function projectSS(
  node: ArtifactRow,
  nodesMap: Map<string, ArtifactRow>,
  childrenMap: Map<string, EdgeRow[]>,
): { markdown: string; text: string; json: unknown } {
  const metadata = parseMetadataJson(node.metadataJson);
  const title = String(metadata.title ?? "Untitled Section");
  const level = Number(metadata.level ?? 1);
  const edges = childrenMap.get(node.fcid) ?? [];
  const paragraphs = [];
  const sections = [];
  const children = [];
  const markdownParts: string[] = [`# ${title}`];
  const textParts: string[] = [title];

  for (const edge of edges) {
    const child = nodesMap.get(edge.childFcid);
    if (!child) continue;
    if (child.type === "PG") {
      const pg = projectPG(child, nodesMap, childrenMap);
      paragraphs.push(pg.json);
      children.push(pg.json);
      if (pg.markdown.length > 0) markdownParts.push(pg.markdown);
      if (pg.text.length > 0) textParts.push(pg.text);
      continue;
    }
    if (child.type === "SS") {
      const ss = projectSS(child, nodesMap, childrenMap);
      sections.push(ss.json);
      children.push(ss.json);
      if (ss.markdown.length > 0) markdownParts.push(ss.markdown);
      if (ss.text.length > 0) textParts.push(ss.text);
    }
  }

  return {
    markdown: [`${"#".repeat(Math.min(Math.max(level, 1), 6))} ${title}`, ...markdownParts.slice(1)].join("\n\n"),
    text: textParts.join("\n\n"),
    json: { type: "SS", fcid: node.fcid, title, level, paragraphs, sections, children },
  };
}

function projectMS(
  node: ArtifactRow,
  nodesMap: Map<string, ArtifactRow>,
  childrenMap: Map<string, EdgeRow[]>,
): { markdown: string; text: string; json: unknown } {
  const metadata = parseMetadataJson(node.metadataJson);
  const role = String(metadata.role ?? "user");
  const edges = childrenMap.get(node.fcid) ?? [];

  const sections = [];
  const paragraphs = [];
  const markdownParts: string[] = [`**${role}:**`];
  const textParts: string[] = [`${role}:`];

  const hasSection = edges.some((e) => nodesMap.get(e.childFcid)?.type === "SS");

  if (hasSection) {
    for (const edge of edges) {
      const child = nodesMap.get(edge.childFcid);
      if (!child || child.type !== "SS") continue;
      const ss = projectSS(child, nodesMap, childrenMap);
      sections.push(ss.json);
      markdownParts.push(ss.markdown);
      textParts.push(ss.text);
    }
  } else {
    for (const edge of edges) {
      const child = nodesMap.get(edge.childFcid);
      if (!child || child.type !== "PG") continue;
      const pg = projectPG(child, nodesMap, childrenMap);
      paragraphs.push(pg.json);
      markdownParts.push(pg.markdown);
      textParts.push(pg.text);
    }
  }

  return {
    markdown: markdownParts.join("\n\n"),
    text: textParts.join("\n\n"),
    json: { type: "MS", fcid: node.fcid, role, sections, paragraphs },
  };
}

function projectDC(
  node: ArtifactRow,
  nodesMap: Map<string, ArtifactRow>,
  childrenMap: Map<string, EdgeRow[]>,
): { markdown: string; text: string; json: unknown } {
  const metadata = parseMetadataJson(node.metadataJson);
  const title = String(metadata.title ?? "Untitled Document");
  const edges = childrenMap.get(node.fcid) ?? [];
  const sections = [];
  const paragraphs = [];
  const markdownParts: string[] = [`# ${title}`];
  const textParts: string[] = [title];

  for (const edge of edges) {
    const child = nodesMap.get(edge.childFcid);
    if (!child) continue;
    if (child.type === "SS") {
      const ss = projectSS(child, nodesMap, childrenMap);
      sections.push(ss.json);
      markdownParts.push(ss.markdown);
      textParts.push(ss.text);
      continue;
    }
    // ADR-010: documents without headings map to DC -> PG -> SN.
    if (child.type === "PG") {
      const pg = projectPG(child, nodesMap, childrenMap);
      paragraphs.push(pg.json);
      if (pg.markdown.length > 0) markdownParts.push(pg.markdown);
      if (pg.text.length > 0) textParts.push(pg.text);
    }
  }

  return {
    markdown: markdownParts.join("\n\n"),
    text: textParts.join("\n\n"),
    json: { type: "DC", fcid: node.fcid, title, sections, paragraphs },
  };
}

function projectCH(
  node: ArtifactRow,
  nodesMap: Map<string, ArtifactRow>,
  childrenMap: Map<string, EdgeRow[]>,
): { markdown: string; text: string; json: unknown } {
  const edges = childrenMap.get(node.fcid) ?? [];
  const messages = [];
  const markdownParts: string[] = [];
  const textParts: string[] = [];

  for (const edge of edges) {
    const child = nodesMap.get(edge.childFcid);
    if (!child || child.type !== "MS") continue;
    const ms = projectMS(child, nodesMap, childrenMap);
    messages.push(ms.json);
    markdownParts.push(ms.markdown);
    textParts.push(ms.text);
  }

  return {
    markdown: markdownParts.join("\n\n"),
    text: textParts.join("\n\n"),
    json: { type: "CH", fcid: node.fcid, messages },
  };
}

/** Renders one node (and everything below it) in all formats. Shared with the Lab 05 assembly engine. */
export function renderArtifactNode(
  node: ArtifactRow,
  nodesMap: Map<string, ArtifactRow>,
  childrenMap: Map<string, EdgeRow[]>,
): { markdown: string; text: string; json: unknown } {
  switch (node.type as SupportedScope) {
    case "SN":
      return projectSN(node);
    case "PG":
      return projectPG(node, nodesMap, childrenMap);
    case "SS":
      return projectSS(node, nodesMap, childrenMap);
    case "MS":
      return projectMS(node, nodesMap, childrenMap);
    case "DC":
      return projectDC(node, nodesMap, childrenMap);
    case "CH":
      return projectCH(node, nodesMap, childrenMap);
    default:
      throw new Error("UNSUPPORTED_SCOPE");
  }
}

export async function projectArtifact(
  artifactFcid: string,
  targetFormat: ProjectionFormat = "markdown",
): Promise<RenderedProjection> {
  const { root, nodesMap, childrenMap } = await loadArtifactWithGraph(artifactFcid);
  if (!root) {
    throw new Error("ARTIFACT_NOT_FOUND");
  }
  if (!PROJECTABLE_TYPES.has(root.type as SupportedScope)) {
    throw new Error("UNSUPPORTED_SCOPE");
  }

  const rendered = renderArtifactNode(root, nodesMap, childrenMap);

  const base: RenderedProjection = {
    artifactFcid: root.fcid,
    scope: root.type as SupportedScope,
    targetFormat,
    lineageMeta: { statelessRebuild: true },
  };

  if (targetFormat === "json") {
    base.structured = rendered.json;
    return base;
  }

  base.content = targetFormat === "markdown" ? rendered.markdown : rendered.text;
  return base;
}
