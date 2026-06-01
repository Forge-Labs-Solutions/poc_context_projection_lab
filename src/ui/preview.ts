import { state } from "./state.js";
import { projectArtifact } from "./api.js";

let previewValue = "Select an artifact to project.";

export async function refreshProjection(): Promise<void> {
  if (!state.selectedFcid) {
    previewValue = "Select an artifact to project.";
    return;
  }
  try {
    const data = await projectArtifact(state.selectedFcid, state.projectionFormat);
    previewValue = data.targetFormat === "json"
      ? JSON.stringify(data.structured ?? {}, null, 2)
      : (data.content ?? "");
  } catch (error) {
    previewValue = error instanceof Error ? error.message : "Projection failed.";
  }
}

export function renderPreview(): string {
  return `<div>
    <label>Format</label>
    <select id="projection-format">
      <option value="markdown" ${state.projectionFormat === "markdown" ? "selected" : ""}>markdown</option>
      <option value="text" ${state.projectionFormat === "text" ? "selected" : ""}>text</option>
      <option value="json" ${state.projectionFormat === "json" ? "selected" : ""}>json</option>
    </select>
    <pre>${escapeHtml(previewValue)}</pre>
  </div>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
