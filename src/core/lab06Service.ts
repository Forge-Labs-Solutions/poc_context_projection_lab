import { randomInt } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { artifactEdges, artifacts } from "../db/schema.js";
import { FcasAmbiguousError, FcasNameAmbiguousError, FcasOrphanedError, FcasUnsupportedError, resolveFcasToFcid } from "./lab03Service.js";
import {
  assemble,
  type AssemblyWarning,
  expandReferences,
  type ManifestEntry,
  Lab05Error,
  normalizeTarget,
} from "./lab05Service.js";

// Lab 06 — Synthetic Projection. Rules: docs/lab 06.md, ADR-011 to ADR-014.
// A synthetic projection is a computed view: it creates no artifact, no edge and changes no source.

export type SynthKind = "document" | "chat" | "view";
export type SynthMode = "selection" | "random" | "template";
export type SynthFormat = "markdown" | "text";
export type RandomType = "SN" | "PG" | "SS" | "MS";

export type Lab06ErrorCode =
  | "ITEM_NOT_FOUND"
  | "INVALID_ITEM"
  | "ITEM_TYPE_NOT_ALLOWED"
  | "ITEM_AMBIGUOUS"
  | "ITEM_ORPHANED"
  | "SCOPE_NOT_FOUND"
  | "SCOPE_AMBIGUOUS"
  | "INVALID_SCOPE"
  | "EMPTY_POOL";

export class Lab06Error extends Error {
  constructor(
    public readonly code: Lab06ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export type SynthesizeInput = {
  kind?: SynthKind;
  title?: string;
  items?: string[];
  template?: string;
  random?: { type: RandomType; count: number; seed?: number; scope?: string };
  expand?: boolean;
  maxDepth?: number;
  format?: SynthFormat;
};

export type SynthManifestEntry = Omit<ManifestEntry, "role"> & {
  role: "item" | "expanded";
  position?: number;
};

export type SynthWarning = AssemblyWarning & { position?: number };

export type RandomInfo = {
  type: RandomType;
  requested: number;
  picked: number;
  poolSize: number;
  seed: number;
  scope: string | null;
};

export type SynthesizeResult = {
  kind: SynthKind;
  mode: SynthMode;
  format: SynthFormat;
  title: string | null;
  content: string;
  manifest: SynthManifestEntry[];
  warnings: SynthWarning[];
  random: RandomInfo | null;
  stats: { items: number; expanded: number; warnings: number };
};

const ALLOWED_TYPES: Record<SynthKind, string[]> = {
  document: ["SN", "PG", "SS"],
  chat: ["MS"],
  view: ["SN", "PG", "SS", "MS"],
};

// ---------- random ----------

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function resolveScopeDescendants(scope: string): Promise<Set<string>> {
  let raw: string;
  try {
    raw = normalizeTarget(scope);
  } catch {
    throw new Lab06Error("INVALID_SCOPE", "scope must be an FCAS reference ([[...]]) or an FCID");
  }

  let rootFcid: string;
  try {
    rootFcid = (await resolveFcasToFcid(raw)).targetFcid;
  } catch (error) {
    if (error instanceof FcasAmbiguousError) {
      throw new Lab06Error("SCOPE_AMBIGUOUS", "scope was split; resolution is ambiguous", {
        originalFcid: error.originalFcid,
        candidates: error.candidates,
      });
    }
    if (error instanceof FcasNameAmbiguousError) {
      throw new Lab06Error("SCOPE_AMBIGUOUS", `scope name "${error.name}" matches more than one artifact`, {
        name: error.name,
        candidates: error.candidates,
      });
    }
    if (error instanceof FcasOrphanedError) {
      // The scope exists but was replaced and nothing active is left under it (ADR-019).
      throw new Lab06Error("SCOPE_NOT_FOUND", "scope target was superseded and has no active successor", {
        orphaned: true,
        originalFcid: error.originalFcid,
        cause: error.cause,
        candidates: error.candidates,
      });
    }
    if (error instanceof FcasUnsupportedError) {
      throw new Lab06Error("INVALID_SCOPE", `The ${error.syntax} syntax is not supported by this POC`);
    }
    if (error instanceof Error && error.message === "FCAS_INVALID") {
      throw new Lab06Error("INVALID_SCOPE", "Invalid FCAS syntax in scope");
    }
    if (error instanceof Error && error.message === "FCAS_TARGET_NOT_FOUND") {
      throw new Lab06Error("SCOPE_NOT_FOUND", "scope target not found");
    }
    throw error;
  }

  const edges = await db.select().from(artifactEdges);
  const childrenByParent = new Map<string, string[]>();
  for (const edge of edges) {
    const children = childrenByParent.get(edge.parentFcid) ?? [];
    children.push(edge.childFcid);
    childrenByParent.set(edge.parentFcid, children);
  }

  const descendants = new Set<string>();
  const queue = [...(childrenByParent.get(rootFcid) ?? [])];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (descendants.has(current)) continue;
    descendants.add(current);
    queue.push(...(childrenByParent.get(current) ?? []));
  }
  return descendants;
}

async function pickRandom(
  random: NonNullable<SynthesizeInput["random"]>,
  kind: SynthKind,
): Promise<{ items: string[]; info: RandomInfo }> {
  const allowed = ALLOWED_TYPES[kind];
  if (!allowed.includes(random.type)) {
    throw new Lab06Error("ITEM_TYPE_NOT_ALLOWED", `Type ${random.type} is not allowed for kind ${kind}`, {
      type: random.type,
      kind,
      allowed,
    });
  }

  const rows = await db
    .select({ fcid: artifacts.fcid })
    .from(artifacts)
    .where(and(eq(artifacts.type, random.type), eq(artifacts.state, "active")));
  let pool = rows.map((row) => row.fcid);

  if (random.scope) {
    const descendants = await resolveScopeDescendants(random.scope);
    pool = pool.filter((fcid) => descendants.has(fcid));
  }
  if (pool.length === 0) {
    throw new Lab06Error("EMPTY_POOL", `No active ${random.type} artifacts available to sample`, {
      type: random.type,
      scope: random.scope ?? null,
    });
  }
  pool.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const seed = random.seed ?? randomInt(0, 2 ** 32);
  const rand = mulberry32(seed);
  const picked = Math.min(random.count, pool.length);
  for (let i = 0; i < picked; i += 1) {
    const j = i + Math.floor(rand() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return {
    items: pool.slice(0, picked),
    info: {
      type: random.type,
      requested: random.count,
      picked,
      poolSize: pool.length,
      seed,
      scope: random.scope ?? null,
    },
  };
}

// ---------- selection ----------

function mapItemError(error: unknown, position: number, kind: SynthKind): unknown {
  if (!(error instanceof Lab05Error)) return error;
  switch (error.code) {
    case "NOT_FOUND":
      return new Lab06Error("ITEM_NOT_FOUND", `Item ${position} not found`, { position });
    case "INVALID_TARGET":
      return new Lab06Error("INVALID_ITEM", `Item ${position} must be an FCAS reference ([[...]]) or an FCID`, { position });
    case "UNSUPPORTED_SCOPE":
      return new Lab06Error("ITEM_TYPE_NOT_ALLOWED", `Item ${position}: ${error.message}`, {
        position,
        kind,
        allowed: ALLOWED_TYPES[kind],
      });
    case "AMBIGUOUS":
      return new Lab06Error("ITEM_AMBIGUOUS", `Item ${position} is ambiguous; choose one of the candidates`, {
        position,
        ...(error.details as object),
      });
    case "ORPHANED":
      return new Lab06Error("ITEM_ORPHANED", `Item ${position} was superseded and has no active successor`, {
        position,
        ...(error.details as object),
      });
    default:
      return error;
  }
}

function compose(title: string | undefined, body: string, format: SynthFormat): string {
  if (!title) return body;
  const header = format === "markdown" ? `# ${title}` : title;
  return body.length > 0 ? `${header}\n\n${body}` : header;
}

// ---------- public API ----------

export async function synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
  const kind = input.kind ?? "view";
  const format = input.format ?? "markdown";
  const expand = input.expand ?? true;
  const maxDepth = input.maxDepth ?? 3;

  if (input.template !== undefined) {
    const expanded = expand
      ? await expandReferences({ text: input.template, maxDepth, format })
      : { content: input.template, manifest: [] as ManifestEntry[], warnings: [] as AssemblyWarning[] };
    const manifest: SynthManifestEntry[] = expanded.manifest.map((entry) => ({ ...entry, role: "expanded" as const }));
    return {
      kind,
      mode: "template",
      format,
      title: input.title ?? null,
      content: compose(input.title, expanded.content, format),
      manifest,
      warnings: expanded.warnings,
      random: null,
      stats: { items: 0, expanded: manifest.length, warnings: expanded.warnings.length },
    };
  }

  let items: string[];
  let random: RandomInfo | null = null;
  let mode: SynthMode = "selection";
  if (input.random) {
    const picked = await pickRandom(input.random, kind);
    items = picked.items;
    random = picked.info;
    mode = "random";
  } else {
    items = input.items ?? [];
  }

  const allowed = ALLOWED_TYPES[kind];
  const parts: string[] = [];
  const manifest: SynthManifestEntry[] = [];
  const warnings: SynthWarning[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const position = index + 1;
    let result: Awaited<ReturnType<typeof assemble>>;
    try {
      result = await assemble({ target: items[index], expand, maxDepth, format });
    } catch (error) {
      throw mapItemError(error, position, kind);
    }
    if (!allowed.includes(result.target.type)) {
      throw new Lab06Error("ITEM_TYPE_NOT_ALLOWED", `Item ${position} is a ${result.target.type}, not allowed for kind ${kind}`, {
        position,
        type: result.target.type,
        kind,
        allowed,
      });
    }

    parts.push(result.content);
    const [root, ...expanded] = result.manifest;
    manifest.push({
      fcid: root.fcid,
      type: root.type,
      role: "item",
      depth: 0,
      position,
      ...(root.evolvedFrom ? { evolvedFrom: root.evolvedFrom } : {}),
    });
    for (const entry of expanded) manifest.push({ ...entry, role: "expanded", position });
    for (const warning of result.warnings) warnings.push({ ...warning, position });
  }

  const body = parts.filter((part) => part.length > 0).join("\n\n");
  return {
    kind,
    mode,
    format,
    title: input.title ?? null,
    content: compose(input.title, body, format),
    manifest,
    warnings,
    random,
    stats: {
      items: items.length,
      expanded: manifest.filter((entry) => entry.role === "expanded").length,
      warnings: warnings.length,
    },
  };
}
