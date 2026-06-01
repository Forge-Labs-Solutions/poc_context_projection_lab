import { createReference, parseFcas, projectFcas, resolveFcas } from "./api.js";
import { state } from "./state.js";

let parseValue = "";
let resolveValue = "";
let targetValue = "";

export function renderFcas(): string {
  return `<section>
    <h2>FCAS Search</h2>
    <label>FCAS</label>
    <input id="fcas-input" placeholder="[[architecture.md#Introduction]]" />
    <button id="fcas-parse">Parse</button>
    <button id="fcas-resolve">Resolve + Project</button>
    <label>Source FCID (optional for reference)</label>
    <input id="fcas-source" placeholder="CH_ABC123" />
    <button id="fcas-reference">Create reference</button>
    <pre>${escapeHtml(`Parse:\n${parseValue}\n\nResolve:\n${resolveValue}\n\nProjection:\n${targetValue}`)}</pre>
  </section>`;
}

export function bindFcas(projectFromSelection: () => Promise<void>): void {
  const parseBtn = document.getElementById("fcas-parse") as HTMLButtonElement | null;
  const resolveBtn = document.getElementById("fcas-resolve") as HTMLButtonElement | null;
  const refBtn = document.getElementById("fcas-reference") as HTMLButtonElement | null;

  if (parseBtn) {
    parseBtn.onclick = async () => {
      const fcas = (document.getElementById("fcas-input") as HTMLInputElement).value.trim();
      try {
        parseValue = JSON.stringify(await parseFcas(fcas), null, 2);
      } catch (error) {
        parseValue = error instanceof Error ? error.message : "parse failed";
      }
      document.dispatchEvent(new CustomEvent("ui:rerender"));
    };
  }

  if (resolveBtn) {
    resolveBtn.onclick = async () => {
      const fcas = (document.getElementById("fcas-input") as HTMLInputElement).value.trim();
      try {
        const resolved = await resolveFcas(fcas);
        resolveValue = JSON.stringify(resolved, null, 2);
        state.selectedFcid = resolved.targetFcid;
        await projectFromSelection();
        targetValue = `Selected ${resolved.targetFcid} and projected in ${state.projectionFormat}.`;
      } catch (error) {
        resolveValue = error instanceof Error ? error.message : "resolve failed";
      }
      document.dispatchEvent(new CustomEvent("ui:rerender"));
    };
  }

  if (refBtn) {
    refBtn.onclick = async () => {
      const fcas = (document.getElementById("fcas-input") as HTMLInputElement).value.trim();
      const sourceFcid = (document.getElementById("fcas-source") as HTMLInputElement).value.trim();
      try {
        await createReference(sourceFcid, fcas);
        targetValue = "Reference created.";
      } catch (error) {
        targetValue = error instanceof Error ? error.message : "reference failed";
      }
      document.dispatchEvent(new CustomEvent("ui:rerender"));
    };
  }
}

export async function copyFcasReference(fcid: string): Promise<void> {
  const result = await projectFcas(fcid);
  await navigator.clipboard.writeText(result.fcas);
  state.toast = "Reference copied";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
