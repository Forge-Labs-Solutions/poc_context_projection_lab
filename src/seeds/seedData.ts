import type { InferInsertModel } from "drizzle-orm";
import {
  artifactEdges,
  artifacts,
  projections,
  referencesTable,
} from "../db/schema.js";

export const seedArtifacts: InferInsertModel<typeof artifacts>[] = [
  { fcid: "WS_MAIN", type: "WS", category: "structural", state: "active" },
  { fcid: "PJ_CORE", type: "PJ", category: "structural", state: "active" },
  { fcid: "DR_DOCS", type: "DR", category: "structural", state: "active" },
  { fcid: "DC_ARCH", type: "DC", category: "structural", state: "active" },
  { fcid: "SS_INTRO", type: "SS", category: "structural", state: "active" },
  { fcid: "PG_0001", type: "PG", category: "structural", state: "active" },
  { fcid: "SN_0001", type: "SN", category: "cognitive", state: "active" },
  { fcid: "CH_RETRIEVAL", type: "CH", category: "structural", state: "active" },
  { fcid: "MS_0002", type: "MS", category: "structural", state: "active" },
  { fcid: "PG_0002", type: "PG", category: "structural", state: "active" },
  { fcid: "SN_0002", type: "SN", category: "cognitive", state: "active" },
];

export const seedEdges: InferInsertModel<typeof artifactEdges>[] = [
  { parentFcid: "WS_MAIN", childFcid: "PJ_CORE", relationType: "contains", orderIndex: 0 },
  { parentFcid: "PJ_CORE", childFcid: "DR_DOCS", relationType: "contains", orderIndex: 0 },
  { parentFcid: "DR_DOCS", childFcid: "DC_ARCH", relationType: "contains", orderIndex: 0 },
  { parentFcid: "DC_ARCH", childFcid: "SS_INTRO", relationType: "contains", orderIndex: 0 },
  { parentFcid: "SS_INTRO", childFcid: "PG_0001", relationType: "contains", orderIndex: 0 },
  { parentFcid: "PG_0001", childFcid: "SN_0001", relationType: "contains", orderIndex: 0 },
  { parentFcid: "DR_DOCS", childFcid: "CH_RETRIEVAL", relationType: "contains", orderIndex: 1 },
  { parentFcid: "CH_RETRIEVAL", childFcid: "MS_0002", relationType: "contains", orderIndex: 0 },
  { parentFcid: "MS_0002", childFcid: "PG_0002", relationType: "contains", orderIndex: 0 },
  { parentFcid: "PG_0002", childFcid: "SN_0002", relationType: "contains", orderIndex: 0 },
];

export const seedProjections: InferInsertModel<typeof projections>[] = [
  {
    projectionId: "PROJ_DOC_ARCH",
    kind: "document",
    rootFcid: "DC_ARCH",
    sourceRef: "docs/architecture.md",
    status: "active",
    metadataJson: JSON.stringify({ title: "Architecture" }),
  },
  {
    projectionId: "PROJ_CHAT_RET",
    kind: "chat",
    rootFcid: "CH_RETRIEVAL",
    sourceRef: "::retrieval-chat",
    status: "active",
    metadataJson: JSON.stringify({ topic: "Retrieval" }),
  },
];

export const seedReferences: InferInsertModel<typeof referencesTable>[] = [
  {
    referenceId: "RF_0001",
    sourceFcid: "SN_0002",
    fcasRaw: "[[architecture.md#Introduction]]",
    targetFcid: "SS_INTRO",
    status: "resolved",
  },
];
