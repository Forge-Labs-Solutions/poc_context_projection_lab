import { artifactByFcid, explorerByFcid } from "./api.js";
import { state } from "./state.js";

let inspectorValue = "Select an artifact to inspect.";

export async function refreshInspector(): Promise<void> {
  if (!state.selectedFcid) {
    inspectorValue = "Select an artifact to inspect.";
    return;
  }
  try {
    const [base, explorer] = await Promise.all([
      artifactByFcid(state.selectedFcid),
      explorerByFcid(state.selectedFcid),
    ]);
    inspectorValue = JSON.stringify({
      fcid: base.fcid,
      type: base.type,
      category: base.category,
      state: base.state,
      parent: explorer.parent,
      children: explorer.children,
      references: explorer.references,
      metadataJson: base.metadataJson,
    }, null, 2);
  } catch (error) {
    inspectorValue = error instanceof Error ? error.message : "Inspector failed.";
  }
}

export function renderInspector(): string {
  return `<pre>${escapeHtml(inspectorValue)}</pre>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
