import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  artifactEdges,
  artifactLineage,
  artifacts,
  evolutionEvents,
  projections,
  referencesTable,
  resourceBindings,
} from "../db/schema.js";
import {
  seedArtifacts,
  seedEdges,
  seedProjections,
  seedReferences,
} from "./seedData.js";

export function resetAndSeed(): void {
  db.transaction((tx) => {
    tx.delete(artifactLineage).run();
    tx.delete(evolutionEvents).run();
    tx.delete(resourceBindings).run();
    tx.delete(referencesTable).run();
    tx.delete(projections).run();
    tx.delete(artifactEdges).run();
    tx.delete(artifacts).run();

    tx.insert(artifacts).values(seedArtifacts).run();
    tx.insert(artifactEdges).values(seedEdges).run();

    if (seedProjections.length > 0) {
      tx.insert(projections).values(seedProjections).run();
    }

    if (seedReferences.length > 0) {
      tx.insert(referencesTable).values(seedReferences).run();
    }
  });
}

export async function seedDatabase(): Promise<void> {
  db.run(sql`PRAGMA foreign_keys = ON`);
  resetAndSeed();
}
