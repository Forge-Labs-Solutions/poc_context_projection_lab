import { FcasAmbiguousError, resolveFcasToFcid } from "./lab03Service.js";
import { loadArtifactWithGraph, renderArtifactNode } from "./projectionService.js";

// Lab 05 — Context Assembly. Rules: docs/lab 05.md, ADR-007 to ADR-009.

export type AssemblyFormat = "markdown" | "text";
export type WarningCode =
  | "NOT_FOUND"
  | "UNSUPPORTED_TARGET"
  | "AMBIGUOUS"
  | "CYCLE"
  | "DEPTH_EXCEEDED"
  | "BLOCK_REFERENCE_INLINE";

export type Lab05ErrorCode =
  | "INVALID_TARGET"
  | "NOT_FOUND"
  | "UNSUPPORTED_SCOPE"
  | "AMBIGUOUS"
  | "INVALID_RANGE"
  | "NO_CHILDREN"
  | "ROLES_NOT_APPLICABLE";

export class Lab05Error extends Error {
  constructor(
    public readonly code: Lab05ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export type AssemblyWarning = {
  code: WarningCode;
  fcas: string;
  depth: number;
  message: string;
  candidates?: string[];
};

export type ManifestEntry = {
  fcid: string;
  type: string;
  role: "root" | "selected" | "expanded";
  depth: number;
  via?: string;
  evolvedFrom?: string;
};

export type Selection = { from: number; to: number; total: number; roles: string[] | null };

export type AssembleInput = {
  target: string;
  range?: { from: number; to?: number };
  roles?: Array<"user" | "assistant" | "system">;
  expand?: boolean;
  maxDepth?: number;
  format?: AssemblyFormat;
};

export type AssembleResult = {
  target: { raw: string; fcid: string; type: string; evolvedFrom: string | null };
  format: AssemblyFormat;
  selection: Selection | null;
  content: string;
  manifest: ManifestEntry[];
  warnings: AssemblyWarning[];
  stats: { expanded: number; warnings: number };
};

export type ExpandResult = {
  content: string;
  manifest: ManifestEntry[];
  warnings: AssemblyWarning[];
  stats: { expanded: number; warnings: number };
};

type Graph = Awaited<ReturnType<typeof loadArtifactWithGraph>>;
type ArtifactRow = NonNullable<Graph["root"]>;

type Ctx = {
  format: AssemblyFormat;
  maxDepth: number;
  nodesMap: Graph["nodesMap"];
  childrenMap: Graph["childrenMap"];
  manifest: ManifestEntry[];
  warnings: AssemblyWarning[];
  expanded: number;
};

const DEFAULT_MAX_DEPTH = 3;
const PROJECTABLE = new Set(["SN", "PG", "SS", "MS", "DC", "CH"]);
const INLINE_TARGETS = new Set(["SN", "PG"]);
const CHILD_TYPES: Record<string, string[]> = {
  DC: ["SS", "PG"],
  SS: ["SS", "PG"],
  MS: ["SS", "PG"],
  CH: ["MS"],
  PG: ["SN"],
  SN: [],
};

const TOKEN = /\[\[([^[\]\n]+)\]\]/g;
const BLOCK_TOKEN = /^\[\[([^[\]\n]+)\]\]$/;
const FCID_PATTERN = /^[A-Z]{2}_[A-Z0-9]{2,}$/;

// ---------- helpers ----------

function render(node: ArtifactRow, ctx: Pick<Ctx, "format" | "nodesMap" | "childrenMap">): string {
  const rendered = renderArtifactNode(node, ctx.nodesMap, ctx.childrenMap);
  return ctx.format === "markdown" ? rendered.markdown : rendered.text;
}

function roleOf(node: ArtifactRow): string {
  try {
    const meta = node.metadataJson ? (JSON.parse(node.metadataJson) as Record<string, unknown>) : {};
    return String(meta.role ?? "user");
  } catch {
    return "user";
  }
}

function warn(ctx: Ctx, code: WarningCode, fcas: string, depth: number, message: string, candidates?: string[]): null {
  ctx.warnings.push({ code, fcas, depth, message, ...(candidates ? { candidates } : {}) });
  return null;
}

function normalizeTarget(target: string): string {
  const trimmed = target.trim();
  if (FCID_PATTERN.test(trimmed)) return `[[${trimmed}]]`;
  if (trimmed.startsWith("[[") && trimmed.endsWith("]]")) return trimmed;
  throw new Lab05Error("INVALID_TARGET", "Target must be an FCAS reference ([[...]]) or an FCID");
}

// ---------- selection ----------

function selectChildren(
  root: ArtifactRow,
  graph: Graph,
  range: AssembleInput["range"],
  roles: AssembleInput["roles"],
): { window: ArtifactRow[]; selection: Selection } {
  if (roles && root.type !== "CH") {
    throw new Lab05Error("ROLES_NOT_APPLICABLE", "roles can only be used when the target is a chat");
  }
  const allowed = CHILD_TYPES[root.type] ?? [];
  if (allowed.length === 0) {
    throw new Lab05Error("NO_CHILDREN", `Artifact type ${root.type} has no children to select`);
  }

  const children = (graph.childrenMap.get(root.fcid) ?? [])
    .map((edge) => graph.nodesMap.get(edge.childFcid))
    .filter((node): node is ArtifactRow => !!node && allowed.includes(node.type));
  const total = children.length;

  const from = range?.from ?? 1;
  const requestedTo = range?.to ?? total;
  if (range && (!Number.isInteger(from) || !Number.isInteger(requestedTo) || from < 1 || from > total || requestedTo < from)) {
    throw new Lab05Error("INVALID_RANGE", `Range must satisfy 1 <= from <= ${total} and to >= from`, {
      from: range.from,
      to: range.to ?? null,
      total,
    });
  }
  const to = Math.min(requestedTo, total);

  let window = children.slice(from - 1, to);
  if (roles) window = window.filter((node) => roles.includes(roleOf(node) as "user" | "assistant" | "system"));
  return { window, selection: { from, to, total, roles: roles ?? null } };
}

// ---------- expansion ----------

async function expandToken(raw: string, depth: number, stack: string[], ctx: Ctx, inline: boolean): Promise<string | null> {
  let resolved: Awaited<ReturnType<typeof resolveFcasToFcid>>;
  try {
    resolved = await resolveFcasToFcid(raw);
  } catch (error) {
    if (error instanceof FcasAmbiguousError) {
      return warn(ctx, "AMBIGUOUS", raw, depth, `${error.originalFcid} was split; reference is ambiguous`, error.candidates);
    }
    if (error instanceof Error && (error.message === "FCAS_TARGET_NOT_FOUND" || error.message === "FCAS_INVALID")) {
      return warn(ctx, "NOT_FOUND", raw, depth, "Reference target not found");
    }
    throw error;
  }

  const node = ctx.nodesMap.get(resolved.targetFcid);
  if (!node) return warn(ctx, "NOT_FOUND", raw, depth, "Reference target not found");
  if (!PROJECTABLE.has(node.type)) {
    return warn(ctx, "UNSUPPORTED_TARGET", raw, depth, `Artifact type ${node.type} cannot be projected`);
  }
  if (inline && !INLINE_TARGETS.has(node.type)) {
    return warn(ctx, "BLOCK_REFERENCE_INLINE", raw, depth, `${node.type} can only be expanded when the reference is alone in its paragraph`);
  }
  if (stack.includes(node.fcid)) return warn(ctx, "CYCLE", raw, depth, `${node.fcid} is already being expanded`);
  if (depth + 1 > ctx.maxDepth) return warn(ctx, "DEPTH_EXCEEDED", raw, depth, `maxDepth ${ctx.maxDepth} reached`);

  let content = render(node, ctx);
  if (inline) content = content.replace(/\s+/g, " ").trim();

  ctx.manifest.push({
    fcid: node.fcid,
    type: node.type,
    role: "expanded",
    depth: depth + 1,
    via: raw,
    ...(resolved.evolvedFrom ? { evolvedFrom: resolved.evolvedFrom } : {}),
  });
  ctx.expanded += 1;
  return expandText(content, depth + 1, [...stack, node.fcid], ctx, inline);
}

async function expandInline(paragraph: string, depth: number, stack: string[], ctx: Ctx): Promise<string> {
  let out = "";
  let last = 0;
  for (const match of paragraph.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    out += paragraph.slice(last, index);
    out += (await expandToken(match[0], depth, stack, ctx, true)) ?? match[0];
    last = index + match[0].length;
  }
  return out + paragraph.slice(last);
}

/**
 * Expands FCAS tokens in already-rendered text. A token that is the only content of its paragraph is a
 * block reference; any other token is inline (ADR-009). `forceInline` keeps the content of an inline
 * expansion inline all the way down.
 */
async function expandText(text: string, depth: number, stack: string[], ctx: Ctx, forceInline: boolean): Promise<string> {
  const parts = text.split(/(\n(?:[ \t]*\n)+)/);
  for (let i = 0; i < parts.length; i += 2) {
    const paragraph = parts[i];
    const trimmed = paragraph.trim();
    if (!forceInline && BLOCK_TOKEN.test(trimmed)) {
      parts[i] = (await expandToken(trimmed, depth, stack, ctx, false)) ?? paragraph;
    } else if (paragraph.includes("[[")) {
      parts[i] = await expandInline(paragraph, depth, stack, ctx);
    }
  }
  return parts.join("");
}

// ---------- public API ----------

export async function assemble(input: AssembleInput): Promise<AssembleResult> {
  const raw = normalizeTarget(input.target);
  const format = input.format ?? "markdown";

  let resolved: Awaited<ReturnType<typeof resolveFcasToFcid>>;
  try {
    resolved = await resolveFcasToFcid(raw);
  } catch (error) {
    if (error instanceof FcasAmbiguousError) {
      throw new Lab05Error("AMBIGUOUS", "Target was split; resolution is ambiguous", {
        originalFcid: error.originalFcid,
        candidates: error.candidates,
      });
    }
    if (error instanceof Error && error.message === "FCAS_INVALID") {
      throw new Lab05Error("INVALID_TARGET", "Invalid FCAS syntax");
    }
    if (error instanceof Error && error.message === "FCAS_TARGET_NOT_FOUND") {
      throw new Lab05Error("NOT_FOUND", "Target not found");
    }
    throw error;
  }

  const graph = await loadArtifactWithGraph(resolved.targetFcid);
  const root = graph.root;
  if (!root) throw new Lab05Error("NOT_FOUND", "Target not found");
  if (!PROJECTABLE.has(root.type)) {
    throw new Lab05Error("UNSUPPORTED_SCOPE", `Artifact type ${root.type} cannot be assembled`);
  }

  const ctx: Ctx = {
    format,
    maxDepth: input.maxDepth ?? DEFAULT_MAX_DEPTH,
    nodesMap: graph.nodesMap,
    childrenMap: graph.childrenMap,
    manifest: [
      {
        fcid: root.fcid,
        type: root.type,
        role: "root",
        depth: 0,
        ...(resolved.evolvedFrom ? { evolvedFrom: resolved.evolvedFrom } : {}),
      },
    ],
    warnings: [],
    expanded: 0,
  };

  let content: string;
  let selection: Selection | null = null;
  if (input.range || input.roles) {
    const picked = selectChildren(root, graph, input.range, input.roles);
    selection = picked.selection;
    const joiner = root.type === "PG" ? " " : "\n\n";
    content = picked.window
      .map((node) => render(node, ctx))
      .filter((part) => part.length > 0)
      .join(joiner);
    for (const node of picked.window) {
      ctx.manifest.push({ fcid: node.fcid, type: node.type, role: "selected", depth: 0 });
    }
  } else {
    content = render(root, ctx);
  }

  if (input.expand ?? true) {
    content = await expandText(content, 0, [root.fcid], ctx, false);
  }

  return {
    target: { raw, fcid: root.fcid, type: root.type, evolvedFrom: resolved.evolvedFrom ?? null },
    format,
    selection,
    content,
    manifest: ctx.manifest,
    warnings: ctx.warnings,
    stats: { expanded: ctx.expanded, warnings: ctx.warnings.length },
  };
}

export async function expandReferences(input: {
  text: string;
  maxDepth?: number;
  format?: AssemblyFormat;
}): Promise<ExpandResult> {
  const graph = await loadArtifactWithGraph("");
  const ctx: Ctx = {
    format: input.format ?? "markdown",
    maxDepth: input.maxDepth ?? DEFAULT_MAX_DEPTH,
    nodesMap: graph.nodesMap,
    childrenMap: graph.childrenMap,
    manifest: [],
    warnings: [],
    expanded: 0,
  };
  const content = await expandText(input.text, 0, [], ctx, false);
  return {
    content,
    manifest: ctx.manifest,
    warnings: ctx.warnings,
    stats: { expanded: ctx.expanded, warnings: ctx.warnings.length },
  };
}
