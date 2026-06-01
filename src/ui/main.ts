import { explorerArtifacts, health, resetSeeds } from "./api.js";
import { bindFcas, copyFcasReference, renderFcas } from "./fcas.js";
import { bindForms, renderForms } from "./forms.js";
import { refreshInspector, renderInspector } from "./inspector.js";
import { refreshProjection, renderPreview } from "./preview.js";
import { state } from "./state.js";
import { renderTree } from "./tree.js";

let apiStatus = "checking...";

async function loadExplorer(): Promise<void> {
  state.explorer = await explorerArtifacts();
  if (!state.selectedProjectFcid) {
    const project = state.explorer.find((a) => a.type === "PJ");
    state.selectedProjectFcid = project?.fcid ?? null;
  }
  for (const n of state.explorer) {
    if (n.type === "WS" || n.type === "PJ") state.expandedNodes.add(n.fcid);
  }
}

async function selectFcid(fcid: string): Promise<void> {
  state.selectedFcid = fcid;
  await Promise.all([refreshProjection(), refreshInspector()]);
  rerender();
}

async function refreshAll(): Promise<void> {
  await loadExplorer();
  await Promise.all([refreshProjection(), refreshInspector()]);
  rerender();
}

function projectOptions(): string {
  const projects = state.explorer.filter((a) => a.type === "PJ");
  return projects
    .map((p) => `<option value="${p.fcid}" ${state.selectedProjectFcid === p.fcid ? "selected" : ""}>${p.fcid}</option>`)
    .join("");
}

function filterByProjectFcid(): void {
  if (!state.selectedProjectFcid) return;
  const allowed = new Set<string>([state.selectedProjectFcid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of state.explorer) {
      if (node.parent.some((p) => allowed.has(p)) && !allowed.has(node.fcid)) {
        allowed.add(node.fcid);
        changed = true;
      }
    }
  }
  state.explorer = state.explorer.filter((n) => n.type === "WS" || allowed.has(n.fcid));
}

function rerender(): void {
  filterByProjectFcid();
  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = `<div class="app">
    <header class="header">
      <div class="left">
        <div class="brand">Context Projection Lab UI</div>
        <label>Project</label>
        <select id="project-selector">${projectOptions()}</select>
      </div>
      <div class="right">
        <div class="status ${apiStatus === "online" ? "ok" : "offline"}">API: ${apiStatus}</div>
        <button id="reset-seeds">Reset seeds</button>
      </div>
    </header>
    <div class="content">
      <aside class="sidebar">
        ${renderForms()}
        ${state.activePanel === "fcas" ? renderFcas() : ""}
      </aside>
      <main class="main">
        <section class="panel">
          <h2>Artifact Tree</h2>
          ${renderTree((fcid) => { void selectFcid(fcid); }, (fcid) => { void onCopyFcas(fcid); })}
          ${state.toast ? `<div class="toast">${state.toast}</div>` : ""}
        </section>
        <section class="panel">
          <h2>Projection Preview</h2>
          ${renderPreview()}
        </section>
        <section class="panel" style="grid-column: 1 / -1;">
          <h2>Artifact Inspector</h2>
          ${renderInspector()}
        </section>
      </main>
    </div>
  </div>`;

  bindForms(async () => {
    state.toast = "";
    await refreshAll();
  });
  bindFcas(async () => {
    await Promise.all([refreshProjection(), refreshInspector()]);
  });
  bindDom();
}

function bindDom(): void {
  const projectSelector = document.getElementById("project-selector") as HTMLSelectElement | null;
  if (projectSelector) {
    projectSelector.onchange = async () => {
      state.selectedProjectFcid = projectSelector.value || null;
      await refreshAll();
    };
  }

  const reset = document.getElementById("reset-seeds") as HTMLButtonElement | null;
  if (reset) {
    reset.onclick = async () => {
      await resetSeeds();
      state.selectedFcid = null;
      state.toast = "";
      await refreshAll();
    };
  }

  const format = document.getElementById("projection-format") as HTMLSelectElement | null;
  if (format) {
    format.onchange = async () => {
      state.projectionFormat = format.value as "markdown" | "text" | "json";
      await refreshProjection();
      rerender();
    };
  }
}

async function onCopyFcas(fcid: string): Promise<void> {
  try {
    await copyFcasReference(fcid);
  } catch (error) {
    state.toast = error instanceof Error ? error.message : "Copy failed";
  }
  rerender();
}

async function init(): Promise<void> {
  try {
    const healthStatus = await health();
    apiStatus = healthStatus.status === "ok" ? "online" : "offline";
  } catch {
    apiStatus = "offline";
  }
  await refreshAll();
}

document.addEventListener("ui:rerender", () => rerender());
void init();
