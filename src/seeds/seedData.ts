import type { InferInsertModel } from "drizzle-orm";
import {
  artifactEdges,
  artifacts,
  projections,
  referencesTable,
} from "../db/schema.js";

export const seedArtifacts: InferInsertModel<typeof artifacts>[] = [
  { fcid: "WS_MAIN", type: "WS", category: "structural", state: "active" },
  { fcid: "PJ_CORE", type: "PJ", category: "structural", state: "active", metadataJson: JSON.stringify({ title: "ForgeOS" }) },
  { fcid: "PJ_LABS", type: "PJ", category: "structural", state: "active", metadataJson: JSON.stringify({ title: "Labs" }) },
];

export const seedEdges: InferInsertModel<typeof artifactEdges>[] = [
  { parentFcid: "WS_MAIN", childFcid: "PJ_CORE", relationType: "contains", orderIndex: 0 },
  { parentFcid: "WS_MAIN", childFcid: "PJ_LABS", relationType: "contains", orderIndex: 1 },
];

export const seedProjections: InferInsertModel<typeof projections>[] = [];

export const seedReferences: InferInsertModel<typeof referencesTable>[] = [];
