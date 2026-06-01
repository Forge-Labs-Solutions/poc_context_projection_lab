import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const artifacts = sqliteTable("artifacts", {
  fcid: text("fcid").primaryKey(),
  type: text("type").notNull(),
  category: text("category", { enum: ["structural", "cognitive"] }).notNull(),
  state: text("state").notNull().default("active"),
  metadataJson: text("metadata_json"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const artifactEdges = sqliteTable(
  "artifact_edges",
  {
    parentFcid: text("parent_fcid")
      .notNull()
      .references(() => artifacts.fcid, { onDelete: "cascade" }),
    childFcid: text("child_fcid")
      .notNull()
      .references(() => artifacts.fcid, { onDelete: "cascade" }),
    relationType: text("relation_type").notNull().default("contains"),
    orderIndex: integer("order_index").notNull().default(0),
  },
  (table) => [
    primaryKey({
      columns: [table.parentFcid, table.childFcid, table.relationType],
    }),
    index("artifact_edges_parent_idx").on(table.parentFcid),
    index("artifact_edges_child_idx").on(table.childFcid),
  ],
);

export const projections = sqliteTable(
  "projections",
  {
    projectionId: text("projection_id").primaryKey(),
    kind: text("kind").notNull(),
    rootFcid: text("root_fcid")
      .notNull()
      .references(() => artifacts.fcid, { onDelete: "restrict" }),
    sourceRef: text("source_ref"),
    status: text("status").notNull().default("active"),
    metadataJson: text("metadata_json"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [index("projections_root_idx").on(table.rootFcid)],
);

export const referencesTable = sqliteTable(
  "references",
  {
    referenceId: text("reference_id").primaryKey(),
    sourceFcid: text("source_fcid")
      .notNull()
      .references(() => artifacts.fcid, { onDelete: "cascade" }),
    fcasRaw: text("fcas_raw").notNull(),
    targetFcid: text("target_fcid")
      .notNull()
      .references(() => artifacts.fcid, { onDelete: "restrict" }),
    status: text("status").notNull().default("resolved"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("references_source_idx").on(table.sourceFcid),
    index("references_target_idx").on(table.targetFcid),
  ],
);

export const resourceBindings = sqliteTable(
  "resource_bindings",
  {
    bindingId: text("binding_id").primaryKey(),
    resourceKey: text("resource_key").notNull(),
    artifactType: text("artifact_type").notNull(),
    artifactFcid: text("artifact_fcid")
      .notNull()
      .references(() => artifacts.fcid, { onDelete: "cascade" }),
    projectionKind: text("projection_kind").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("resource_bindings_resource_idx").on(table.resourceKey),
    index("resource_bindings_artifact_idx").on(table.artifactFcid),
    uniqueIndex("resource_bindings_unique_idx").on(table.resourceKey, table.artifactType),
  ],
);

export const artifactsRelations = relations(artifacts, ({ many }) => ({
  children: many(artifactEdges),
}));

export const artifactEdgesRelations = relations(artifactEdges, ({ one }) => ({
  parent: one(artifacts, {
    fields: [artifactEdges.parentFcid],
    references: [artifacts.fcid],
  }),
  child: one(artifacts, {
    fields: [artifactEdges.childFcid],
    references: [artifacts.fcid],
  }),
}));

export const projectionsRelations = relations(projections, ({ one }) => ({
  root: one(artifacts, {
    fields: [projections.rootFcid],
    references: [artifacts.fcid],
  }),
}));

export const referencesRelations = relations(referencesTable, ({ one }) => ({
  source: one(artifacts, {
    fields: [referencesTable.sourceFcid],
    references: [artifacts.fcid],
  }),
  target: one(artifacts, {
    fields: [referencesTable.targetFcid],
    references: [artifacts.fcid],
  }),
}));

export const resourceBindingsRelations = relations(resourceBindings, ({ one }) => ({
  artifact: one(artifacts, {
    fields: [resourceBindings.artifactFcid],
    references: [artifacts.fcid],
  }),
}));
