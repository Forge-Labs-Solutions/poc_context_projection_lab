import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { artifactEdges, artifacts, projections, referencesTable, resourceBindings } from "../db/schema.js";
import { projectFcidToFcas, resolveFcasToFcid } from "./lab03Service.js";
import { Lab04Error, orderedChildren, parseMeta, resolveReferenceContinuity, rewriteChildren } from "./lab04Service.js";

// Lab 03.5 — Reference Stability. Rules: docs/lab 03.md (Sub-Lab 03.5), ADR-024.
// A reference is stored by the FCID of its target, so renaming, moving and reordering never invalidate it. What
// can go out of date is the FCAS text that was stored next to it; that is the `stale` state.

export type Lab035ErrorCode = "NOT_FOUND" | "INVALID_OPERATION" | "CONFLICT" | "CYCLE" | "NOT_A_PERMUTATION" | "TARGET_NOT_ACTIVE";

export class Lab035Error extends Error {
  constructor(
    public readonly code: Lab035ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export type ReferenceState = "resolved" | "stale" | "evolved" | "ambiguous" | "orphaned";

export type ReferenceReport = {
  referenceId: string;
  fcasRaw: string;
  targetFcid: string;
  status: ReferenceState;
  /** Active FCIDs the target evolved into (evolved or ambiguous); empty when orphaned. */
  currentFcids: string[];
  /** The FCAS the target has now, or null when the target has no active successor. */
  canonicalFcas: string | null;
};

export type StatusCounts = { total: number; resolved: number; stale: number };

// ---------- reference states ----------

/**
 * `resolved`: the target is active and the stored text still resolves to it. `stale`: the target is active and
 * valid by FCID, but the stored text no longer resolves to it (renamed, reordered, name now shared).
 * `evolved`, `ambiguous` and `orphaned` come from the lineage (Lab 04, ADR-005 and ADR-019).
 */
export async function referenceStatus(referenceId: string): Promise<ReferenceReport> {
  let continuity: ReturnType<typeof resolveReferenceContinuity>;
  try {
    continuity = resolveReferenceContinuity(referenceId);
  } catch (error) {
    if (error instanceof Lab04Error && error.code === "NOT_FOUND") throw new Lab035Error("NOT_FOUND", `Reference ${referenceId} not found`);
    throw error;
  }

  const base = { referenceId, fcasRaw: continuity.fcasRaw, targetFcid: continuity.targetFcid, currentFcids: continuity.currentFcids };
  if (continuity.status !== "resolved") {
    const canonicalFcas = continuity.status === "evolved" ? await projectFcidToFcas(continuity.currentFcids[0]) : null;
    return { ...base, status: continuity.status, canonicalFcas };
  }

  let resolvesTo: string | null = null;
  try {
    resolvesTo = (await resolveFcasToFcid(continuity.fcasRaw)).targetFcid;
  } catch {
    resolvesTo = null; // not found, ambiguous name, orphaned, unsupported: the text no longer reaches the target
  }
  return {
    ...base,
    status: resolvesTo === continuity.targetFcid ? "resolved" : "stale",
    canonicalFcas: await projectFcidToFcas(continuity.targetFcid),
  };
}

/** Writes `resolved` or `stale` into the stored status of every reference. The lineage states stay computed. */
async function syncStoredStatuses(): Promise<StatusCounts> {
  const rows = await db.select().from(referencesTable);
  const counts: StatusCounts = { total: rows.length, resolved: 0, stale: 0 };
  for (const row of rows) {
    const report = await referenceStatus(row.referenceId);
    if (report.status === "resolved") counts.resolved += 1;
    if (report.status === "stale") counts.stale += 1;
    if ((report.status === "resolved" || report.status === "stale") && report.status !== row.status) {
      await db.update(referencesTable).set({ status: report.status }).where(eq(referencesTable.referenceId, row.referenceId));
    }
  }
  return counts;
}

/** Rewrites the stored FCAS of a stale reference to the canonical one. The target never changes. */
export async function refreshReference(referenceId: string): Promise<ReferenceReport> {
  const report = await referenceStatus(referenceId);
  if (report.status !== "resolved" && report.status !== "stale") {
    throw new Lab035Error("TARGET_NOT_ACTIVE", `The target of ${referenceId} is ${report.status}; a reference is only refreshed while its target is active`, {
      status: report.status,
      currentFcids: report.currentFcids,
    });
  }
  if (report.status === "stale" && report.canonicalFcas) {
    await db
      .update(referencesTable)
      .set({ fcasRaw: report.canonicalFcas, status: "resolved" })
      .where(eq(referencesTable.referenceId, referenceId));
  }
  return referenceStatus(referenceId);
}

// ---------- rename ----------

const BAD_DOCUMENT_KEY = /[#[\]\r\n]/;
const BAD_CHAT_KEY = /[<>[\]\r\n]/;

function validateKey(type: "DC" | "CH", key: string): void {
  if (type === "DC") {
    const addressable = /\.md$/i.test(key) && !BAD_DOCUMENT_KEY.test(key) && !/^(::|\$|@|#)/.test(key);
    if (!addressable) throw new Lab035Error("INVALID_OPERATION", "A document key must end with .md and cannot contain #, [, ], line breaks or start with ::, $, @ or #");
  } else {
    const addressable = key.startsWith("::") && key.length > 2 && !BAD_CHAT_KEY.test(key);
    if (!addressable) throw new Lab035Error("INVALID_OPERATION", "A chat key must start with :: and cannot contain <, >, [, ] or line breaks");
  }
}

async function getArtifact(fcid: string) {
  const row = await db.select().from(artifacts).where(eq(artifacts.fcid, fcid)).limit(1);
  if (!row[0]) throw new Lab035Error("NOT_FOUND", `Artifact ${fcid} not found`);
  return row[0];
}

/**
 * Renames a document or chat (its resource key, the name in its FCAS) or a project or directory (its title). The
 * FCID, the content and the structure do not change; references keep their target and may become stale.
 */
export async function renameResource(input: {
  fcid: string;
  resourceKey?: string;
  title?: string;
}): Promise<{ fcid: string; previous: string | null; current: string | null; references: StatusCounts }> {
  const row = await getArtifact(input.fcid);

  if (row.type === "DC" || row.type === "CH") {
    if (input.resourceKey === undefined && input.title === undefined) {
      throw new Lab035Error("INVALID_OPERATION", "Give a resourceKey, a title or both");
    }
    const binding = await db.select().from(resourceBindings).where(eq(resourceBindings.artifactFcid, row.fcid)).limit(1);
    if (!binding[0]) throw new Lab035Error("INVALID_OPERATION", `${row.fcid} has no resource key to rename`);
    const previous = binding[0].resourceKey;
    const current = input.resourceKey ?? previous;

    if (current !== previous) {
      validateKey(row.type, current);
      const taken = await db
        .select()
        .from(resourceBindings)
        .where(and(eq(resourceBindings.resourceKey, current), eq(resourceBindings.artifactType, row.type)))
        .limit(1);
      if (taken[0]) throw new Lab035Error("CONFLICT", `The key ${current} is already used by ${taken[0].artifactFcid}`, { fcid: taken[0].artifactFcid });
    }

    db.transaction((tx) => {
      if (current !== previous) {
        tx.update(resourceBindings).set({ resourceKey: current, updatedAt: new Date() }).where(eq(resourceBindings.bindingId, binding[0].bindingId)).run();
        tx.update(artifacts)
          .set({ metadataJson: JSON.stringify({ ...parseMeta(row), resourceKey: current }), updatedAt: new Date() })
          .where(eq(artifacts.fcid, row.fcid))
          .run();
      }
      for (const projection of tx.select().from(projections).where(eq(projections.rootFcid, row.fcid)).all()) {
        const meta = projection.metadataJson ? (JSON.parse(projection.metadataJson) as Record<string, unknown>) : {};
        tx.update(projections)
          .set({
            sourceRef: projection.sourceRef === previous ? current : projection.sourceRef,
            metadataJson: JSON.stringify(input.title !== undefined ? { ...meta, title: input.title } : meta),
            updatedAt: new Date(),
          })
          .where(eq(projections.projectionId, projection.projectionId))
          .run();
      }
    });
    return { fcid: row.fcid, previous, current, references: await syncStoredStatuses() };
  }

  if (row.type === "DR" || row.type === "PJ") {
    if (input.title === undefined) throw new Lab035Error("INVALID_OPERATION", `A ${row.type} is renamed with a title`);
    const previous = String(parseMeta(row).title ?? "") || null;
    db.update(artifacts)
      .set({ metadataJson: JSON.stringify({ ...parseMeta(row), title: input.title }), updatedAt: new Date() })
      .where(eq(artifacts.fcid, row.fcid))
      .run();
    return { fcid: row.fcid, previous, current: input.title, references: await syncStoredStatuses() };
  }

  throw new Lab035Error("INVALID_OPERATION", `A ${row.type} cannot be renamed; only documents, chats, directories and projects have a name`);
}

// ---------- move ----------

const MOVABLE = new Set(["DC", "DR"]);
const PARENTS = new Set(["WS", "PJ", "DR"]);

function isInside(candidateFcid: string, ancestorFcid: string): boolean {
  let current = candidateFcid;
  const seen = new Set<string>();
  while (!seen.has(current)) {
    if (current === ancestorFcid) return true;
    seen.add(current);
    const edge = db
      .select()
      .from(artifactEdges)
      .where(and(eq(artifactEdges.childFcid, current), eq(artifactEdges.relationType, "contains")))
      .get();
    if (!edge) return false;
    current = edge.parentFcid;
  }
  return false;
}

/** Moves a document or a directory under the workspace, a project or another directory. FCIDs do not change. */
export async function moveArtifact(input: {
  fcid: string;
  newParentFcid: string;
}): Promise<{ fcid: string; previousParent: string | null; newParent: string; references: StatusCounts }> {
  const row = await getArtifact(input.fcid);
  const parent = await getArtifact(input.newParentFcid);
  if (!MOVABLE.has(row.type)) throw new Lab035Error("INVALID_OPERATION", `A ${row.type} cannot be moved; only documents and directories can`);
  if (!PARENTS.has(parent.type)) throw new Lab035Error("INVALID_OPERATION", `A ${parent.type} cannot hold a ${row.type}; use the workspace, a project or a directory`);
  if (isInside(parent.fcid, row.fcid)) throw new Lab035Error("CYCLE", `${parent.fcid} is ${row.fcid} or is inside it`);

  const previousParent = db.transaction((tx) => {
    const edges = tx
      .select()
      .from(artifactEdges)
      .where(and(eq(artifactEdges.childFcid, row.fcid), eq(artifactEdges.relationType, "contains")))
      .all();
    tx.delete(artifactEdges).where(and(eq(artifactEdges.childFcid, row.fcid), eq(artifactEdges.relationType, "contains"))).run();
    tx.insert(artifactEdges).values({ parentFcid: parent.fcid, childFcid: row.fcid, relationType: "contains", orderIndex: Date.now() }).run();
    return edges[0]?.parentFcid ?? null;
  });
  return { fcid: row.fcid, previousParent, newParent: parent.fcid, references: await syncStoredStatuses() };
}

// ---------- reorder ----------

/** Puts the children of a parent in a new order. The list must be a permutation of the current children. */
export async function reorderChildren(input: {
  parentFcid: string;
  childFcids: string[];
}): Promise<{ parentFcid: string; childFcids: string[]; references: StatusCounts }> {
  const parent = await getArtifact(input.parentFcid);

  db.transaction((tx) => {
    const current = orderedChildren(tx, parent.fcid);
    const same =
      current.length === input.childFcids.length && [...current].sort().join("|") === [...input.childFcids].sort().join("|");
    if (!same) {
      throw new Lab035Error("NOT_A_PERMUTATION", "childFcids must list every current child exactly once", { current, received: input.childFcids });
    }
    rewriteChildren(tx, parent.fcid, input.childFcids);
  });
  return { parentFcid: parent.fcid, childFcids: input.childFcids, references: await syncStoredStatuses() };
}
