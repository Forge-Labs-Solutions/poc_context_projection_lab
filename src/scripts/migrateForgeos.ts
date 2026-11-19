import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type MigrationReport, migrateForgeosChats } from "../core/forgeosMigration.js";

// Lab 01.5 — migrates the chats of a COPY of the ForgeOS database into the POC database (DATABASE_URL).
//   DATABASE_URL=./data/lab015.db pnpm run lab015:migrate --source <copy of forgeos.db> [--include-deleted] [--report-dir <dir>]
// The source is opened read-only and the original path (.forgeos/forgeos.db) is refused. The report has counts only.

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function markdown(report: MigrationReport, stamp: string): string {
  const { counts, preservation, fidelity, references, gaps, runChanges } = report;
  const list = (record: Record<string, number>) =>
    Object.keys(record).length === 0 ? "nenhum" : Object.entries(record).map(([key, value]) => `${key} ${value}`).join(", ");
  return [
    `# Relatório da migração de chats do ForgeOS (${stamp})`,
    "",
    `Fonte: \`${report.source.file}\` (cópia, somente leitura). Chats apagados: ${report.source.includeDeleted ? "incluídos" : "omitidos"}. Duração: ${report.durationMs} ms.`,
    "",
    "## Contagens",
    "",
    "| Item | Valor |",
    "| ---- | ----- |",
    `| Chats lidos | ${counts.chatsRead} |`,
    `| Chats apagados omitidos | ${counts.chatsDeletedOmitted} |`,
    `| Chats migrados | ${counts.chatsMigrated} (criados nesta execução: ${counts.chatsCreated}) |`,
    `| Chats recusados | ${counts.chatsRefused} |`,
    `| Mensagens nos chats escolhidos | ${counts.messagesRead} |`,
    `| Mensagens migradas | ${counts.messagesMigrated} |`,
    `| Mensagens vazias | ${counts.emptyMessages} |`,
    `| Artefatos criados | ${list(report.artifactsCreated)} |`,
    `| Banco (antes, depois) | ${report.databaseBytes.before ?? "-"} B, ${report.databaseBytes.after ?? "-"} B |`,
    "",
    "## Mudanças desta execução (motor da Parte A)",
    "",
    `mantidos ${runChanges.kept} · editados ${runChanges.edited} · substituídos ${runChanges.replaced} · removidos ${runChanges.removed} · adicionados ${runChanges.added} · movidos ${runChanges.moved} · metadados ${runChanges.metadata}`,
    "",
    "## Preservação dos FCIDs",
    "",
    `- CH: ${preservation.chats.preserved} de ${preservation.chats.expected}`,
    `- MS: ${preservation.messages.preserved} de ${preservation.messages.expected}`,
    "",
    "## Fidelidade do texto",
    "",
    `exact ${fidelity.exact} · whitespace ${fidelity.whitespace} · structure ${fidelity.structure} · loss ${fidelity.loss}`,
    "",
    `Categorias de \`structure\`: ${list(fidelity.structureCategories)}.`,
    "",
    "## Referências",
    "",
    `lidas ${references.read} · migradas ${references.migrated} (stale: ${references.staleMigrated}) · sem mudança ${references.unchanged} · atualizadas ${references.updated} · alvo conceito ${references.conceptTargets} · outro alvo ${references.otherTargets} · origem não migrada ${references.sourceNotMigrated} · alvo não migrado ${references.targetNotMigrated}`,
    "",
    "## Lacunas",
    "",
    `- chats apagados: ${gaps.deletedChats}`,
    `- referências a conceito: ${gaps.conceptReferences}; referências stale: ${gaps.staleReferences}`,
    `- chat_lineage: ${gaps.chatLineage.total} (${list(gaps.chatLineage.byType)})`,
    `- chats com projeto: ${gaps.chatsWithProject}`,
    `- chats sem reference_name: ${gaps.chatsWithoutReferenceName}; nomes repetidos: ${gaps.referenceNameCollisions}; nomes inseguros: ${gaps.unsafeReferenceNames}`,
    `- mensagens com autor: ${gaps.messagesWithAuthor}; com provedor ou modelo: ${gaps.messagesWithModelInfo}`,
    "",
    "## Recusados",
    "",
    report.refused.length === 0 ? "Nenhum." : report.refused.map((r) => `- ${r.chat}: ${r.reason}`).join("\n"),
    "",
  ].join("\n");
}

const source = argument("--source");
if (!source) {
  console.error("Usage: pnpm run lab015:migrate --source <copy of forgeos.db> [--include-deleted] [--report-dir <dir>]");
  process.exit(2);
}

const report = migrateForgeosChats({ sourcePath: source, includeDeleted: process.argv.includes("--include-deleted") });

const reportDir = resolve(argument("--report-dir") ?? "./data/lab015-report");
mkdirSync(reportDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(join(reportDir, `report-${stamp}.json`), JSON.stringify(report, null, 2));
writeFileSync(join(reportDir, `report-${stamp}.md`), markdown(report, stamp));

console.log(JSON.stringify(report, null, 2));
console.log(`\nReport written to ${reportDir}`);
