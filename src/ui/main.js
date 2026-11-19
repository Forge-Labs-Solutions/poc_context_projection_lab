const state = {
  activePanel: "document",
  selectedProjectFcid: null,
  selectedFcid: null,
  projectionFormat: "markdown",
  expandedNodes: new Set(),
  treeRoots: [],
  treeFlat: [],
  visibleFlat: [],
  modal: null,
  toast: "",
};

let apiStatus = "checking...";
let previewValue = "Select an artifact to project.";
let inspectorValue = "Select an artifact to inspect.";
let lineageData = null;
let parseValue = "";
let resolveValue = "";
let targetValue = "";

async function request(url, init) {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(typeof body.error === "string" ? body.error : "Request failed");
  return body.data ?? body;
}

const api = {
  health: () => request("/health"),
  resetSeeds: () => request("/v1/seeds/reset", { method: "POST" }),
  explorerTree: () => request("/v1/lab01/explorer/tree"),
  artifactByFcid: (fcid) => request(`/v1/artifacts/${encodeURIComponent(fcid)}`),
  explorerByFcid: (fcid) => request(`/v1/lab01/explorer/artifacts/${encodeURIComponent(fcid)}`),
  lineage: (fcid) => request(`/v1/lab04/lineage/${encodeURIComponent(fcid)}`),
  projectArtifact: (artifactFcid, targetFormat) => request("/v1/lab02/project", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ artifactFcid, targetFormat }),
  }),
  projectFcas: (targetFcid) => request("/v1/lab03/project-fcas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetFcid }),
  }),
  parseFcas: (fcas) => request("/v1/lab03/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fcas }),
  }),
  resolveFcas: (fcas) => request("/v1/lab03/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fcas }),
  }),
  createReference: (sourceFcid, fcas) => request("/v1/lab03/references", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceFcid, fcas }),
  }),
  importDocument: (payload) => request("/v1/lab01/import/document", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }),
  importDirectory: (payload) => request("/v1/lab01/import/directory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }),
  createChat: (resourceKey, title) => request("/v1/lab01/chat/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resourceKey, title }),
  }),
  addMessage: (chatFcid, payload) => request(`/v1/lab01/chat/${encodeURIComponent(chatFcid)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }),
};

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function flattenTree(roots) {
  const out = [];
  const walk = (node) => {
    out.push({
      fcid: node.fcid,
      type: node.type,
      category: node.category,
      state: node.state,
      metadataJson: node.metadataJson ?? null,
      parent: node.parent ?? [],
      children: (node.children || []).map((c) => c.fcid),
      references: node.references ?? [],
    });
    for (const child of node.children || []) walk(child);
  };
  for (const root of roots || []) walk(root);
  return out;
}

function nodeOrder(a, b) {
  const order = ["WS", "PJ", "DR", "DC", "CH", "MS", "SS", "PG", "SN"];
  const ai = order.indexOf(a.type);
  const bi = order.indexOf(b.type);
  if (ai !== bi) return ai - bi;
  return a.fcid.localeCompare(b.fcid);
}

async function loadTree() {
  const tree = await api.explorerTree();
  state.treeRoots = tree.roots || [];
  state.treeFlat = flattenTree(state.treeRoots);
  if (!state.selectedProjectFcid) {
    const workspace = state.treeFlat.find((n) => n.type === "WS");
    state.selectedProjectFcid = workspace ? workspace.fcid : null;
  }
  for (const n of state.treeFlat) if (n.type === "WS" || n.type === "PJ") state.expandedNodes.add(n.fcid);
}

function byFcidMap(nodes) {
  return new Map(nodes.map((n) => [n.fcid, n]));
}

function getVisibleFcidSet() {
  const all = state.treeFlat;
  const visible = new Set();
  const map = byFcidMap(all);

  // Assembly can target documents and chats alike, so nothing is filtered out.
  if (state.activePanel === "assembly") return new Set(all.map((n) => n.fcid));

  if (state.activePanel === "chat") {
    const chatFcids = all.filter((n) => n.type === "CH").map((n) => n.fcid);
    for (const fcid of chatFcids) visible.add(fcid);

    // include full ancestry (WS/PJ/...) for each CH
    for (const chatFcid of chatFcids) {
      let current = map.get(chatFcid);
      while (current) {
        visible.add(current.fcid);
        const parent = (current.parent || []).find((p) => map.has(p));
        if (!parent) break;
        current = map.get(parent);
      }
    }

    // include descendants only for selected chat branch
    const selectedChat = findSelectedChatFcidFromFlat(all, state.selectedFcid);
    if (selectedChat) {
      let changed = true;
      while (changed) {
        changed = false;
        for (const node of all) {
          if (visible.has(node.fcid)) continue;
          if ((node.parent || []).some((p) => visible.has(p)) && isUnderChat(node.fcid, selectedChat, map)) {
            visible.add(node.fcid);
            changed = true;
          }
        }
      }
    }

    return visible;
  }

  if (!state.selectedProjectFcid) {
    for (const n of all) visible.add(n.fcid);
    return visible;
  }

  visible.add(state.selectedProjectFcid);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of all) {
      if (visible.has(node.fcid)) continue;
      if ((node.parent || []).some((p) => visible.has(p))) {
        visible.add(node.fcid);
        changed = true;
      }
    }
  }
  for (const n of all.filter((x) => x.type === "WS")) visible.add(n.fcid);
  return visible;
}

function isUnderChat(fcid, chatFcid, map) {
  let current = map.get(fcid);
  while (current) {
    if (current.type === "CH") return current.fcid === chatFcid;
    const parent = (current.parent || []).find((p) => map.has(p));
    if (!parent) return false;
    current = map.get(parent);
  }
  return false;
}

function findSelectedChatFcidFromFlat(flat, selectedFcid) {
  if (!selectedFcid) return null;
  const map = byFcidMap(flat);
  let current = map.get(selectedFcid);
  while (current) {
    if (current.type === "CH") return current.fcid;
    const parent = (current.parent || []).find((p) => map.has(p));
    if (!parent) return null;
    current = map.get(parent);
  }
  return null;
}

function setVisibleFlat() {
  const visible = getVisibleFcidSet();
  state.visibleFlat = state.treeFlat.filter((n) => visible.has(n.fcid));
}

function getVisibleTreeRoots() {
  const visible = new Set(state.visibleFlat.map((n) => n.fcid));
  const prune = (node) => {
    if (!visible.has(node.fcid)) return null;
    return {
      ...node,
      children: (node.children || []).map(prune).filter(Boolean),
    };
  };
  return (state.treeRoots || []).map(prune).filter(Boolean).sort(nodeOrder);
}

async function refreshProjection() {
  if (!state.selectedFcid) {
    previewValue = "Select an artifact to project.";
    return;
  }
  try {
    const data = await api.projectArtifact(state.selectedFcid, state.projectionFormat);
    if (data.targetFormat === "json") {
      previewValue = JSON.stringify(data.structured || {}, null, 2);
      if (previewValue === "{}") previewValue = "(empty projection)";
      return;
    }
    const content = typeof data.content === "string" ? data.content.trim() : "";
    previewValue = content.length > 0 ? data.content : "(empty projection)";
  } catch (error) {
    previewValue = error && error.message ? error.message : "Projection failed";
  }
}

async function refreshInspector() {
  if (!state.selectedFcid) {
    inspectorValue = "Select an artifact to inspect.";
    lineageData = null;
    return;
  }
  lineageData = await api.lineage(state.selectedFcid).catch(() => null);
  try {
    const [base, explorer] = await Promise.all([
      api.artifactByFcid(state.selectedFcid),
      api.explorerByFcid(state.selectedFcid),
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
    inspectorValue = error && error.message ? error.message : "Inspector failed";
  }
}

const RELATION_LABEL = {
  evolves_from: "evolves from",
  split_from: "split from",
  merged_from: "merged from",
};

function lineageLink(fcid) {
  return `<button class="lineage-fcid" data-lineage-select="${escapeHtml(fcid)}">${escapeHtml(fcid)}</button>`;
}

function lineageStateBadge(stateName) {
  return `<span class="badge ${stateName === "superseded" ? "badge-superseded" : "badge-active"}">${escapeHtml(stateName)}</span>`;
}

function lineageStep(step) {
  const indent = Math.max(0, step.depth - 1) * 14;
  return `<li style="margin-left:${indent}px"><span class="lineage-rel">${escapeHtml(RELATION_LABEL[step.relation] || step.relation)}</span> ${lineageLink(step.fcid)} ${lineageStateBadge(step.state)}</li>`;
}

function lineageEvent(event) {
  const when = event.createdAt ? new Date(event.createdAt).toLocaleString() : "";
  const detail = JSON.stringify({ before: event.before, after: event.after }, null, 2);
  const inputs = (event.inputs || []).map(lineageLink).join(" ");
  const outputs = (event.outputs || []).map(lineageLink).join(" ");
  return `<li><div><strong>${escapeHtml(event.operation)}</strong> <span class="hint">${escapeHtml(when)}</span></div><div class="lineage-io">${inputs} &rarr; ${outputs}</div><details><summary>before / after</summary><pre>${escapeHtml(detail)}</pre></details></li>`;
}

function renderLineage() {
  if (!state.selectedFcid) return "";
  if (!lineageData) return `<h3 class="lineage-title">Lineage</h3><div class="hint">Lineage unavailable for this artifact.</div>`;

  const { ancestors = [], descendants = [], current = [], events = [] } = lineageData;
  const superseded = lineageData.state === "superseded";
  const parts = [`<h3 class="lineage-title">Lineage ${lineageStateBadge(lineageData.state)}</h3>`];

  if (superseded) {
    parts.push(`<div class="lineage-block"><div class="hint">Current</div>${current.length > 0 ? `<div>${current.map(lineageLink).join(" ")}</div>` : `<div class="hint">none (no active descendants)</div>`}</div>`);
  }
  if (ancestors.length > 0) {
    parts.push(`<div class="lineage-block"><div class="hint">Ancestors</div><ul class="lineage-list">${ancestors.map(lineageStep).join("")}</ul></div>`);
  }
  if (descendants.length > 0) {
    parts.push(`<div class="lineage-block"><div class="hint">Descendants</div><ul class="lineage-list">${descendants.map((step) => `<li style="margin-left:${Math.max(0, step.depth - 1) * 14}px">${lineageLink(step.fcid)} ${lineageStateBadge(step.state)} <span class="lineage-rel">${escapeHtml(RELATION_LABEL[step.relation] || step.relation)} ${lineageLink(step.via)}</span></li>`).join("")}</ul></div>`);
  }
  if (events.length > 0) {
    parts.push(`<div class="lineage-block"><div class="hint">Events (${events.length})</div><ul class="lineage-list">${events.map(lineageEvent).join("")}</ul></div>`);
  }
  if (ancestors.length === 0 && descendants.length === 0 && events.length === 0) {
    parts.push(`<div class="hint">No evolution recorded. This artifact is in its original form.</div>`);
  }
  return parts.join("");
}

function renderTree(onSelect, onCopy) {
  const roots = getVisibleTreeRoots();

  const renderNode = (node) => {
    const expanded = state.expandedNodes.has(node.fcid);
    const selected = state.selectedFcid === node.fcid ? "active" : "";
    const children = (node.children || []).sort(nodeOrder);
    const toggle = children.length > 0 ? (expanded ? "[-]" : "[+]") : "[.]";
    const inner = expanded && children.length > 0 ? `<ul>${children.map((c) => renderNode(c)).join("")}</ul>` : "";
    return `<li><div class="tree-node ${selected}" data-select-row="${node.fcid}"><button data-toggle="${node.fcid}" class="select-node">${toggle}</button><button data-select="${node.fcid}" class="select-node ${selected}">${node.type}</button><button data-select="${node.fcid}" class="select-node tree-fcid ${selected}">${node.fcid}</button><button data-copy="${node.fcid}" title="Copy FCAS">Copy</button></div>${inner}</li>`;
  };

  queueMicrotask(() => {
    document.querySelectorAll("[data-toggle]").forEach((el) => el.onclick = (event) => {
      event.stopPropagation();
      const fcid = el.dataset.toggle || "";
      if (state.expandedNodes.has(fcid)) state.expandedNodes.delete(fcid); else state.expandedNodes.add(fcid);
      rerender();
    });
    document.querySelectorAll("[data-select]").forEach((el) => el.onclick = (event) => {
      event.stopPropagation();
      void selectFcid(el.dataset.select || "");
    });
    document.querySelectorAll("[data-copy]").forEach((el) => el.onclick = (event) => {
      event.stopPropagation();
      void onCopy(el.dataset.copy || "");
    });
    document.querySelectorAll("[data-select-row]").forEach((el) => el.onclick = () => void onSelect(el.dataset.selectRow || ""));
  });

  return `<div class="tree"><ul>${roots.map((n) => renderNode(n)).join("")}</ul></div>`;
}

function parseRole(msNode) {
  try {
    if (!msNode.metadataJson) return "user";
    const meta = JSON.parse(msNode.metadataJson);
    return meta.role || "user";
  } catch {
    return "user";
  }
}

function buildNodeText(rootFcid) {
  const map = byFcidMap(state.visibleFlat);
  const texts = [];
  const walk = (fcid) => {
    const node = map.get(fcid);
    if (!node) return;
    if (node.type === "SN") {
      try {
        const meta = node.metadataJson ? JSON.parse(node.metadataJson) : {};
        if (meta.text) texts.push(String(meta.text));
      } catch {
        return;
      }
    }
    for (const child of node.children || []) walk(child);
  };
  walk(rootFcid);
  return texts.join(" ");
}

// ---------- Assembly panel (Lab 05) ----------
// Form values live in this object because render() rebuilds the whole DOM.

const assembly = {
  mode: "assemble",
  target: "",
  from: "",
  to: "",
  roles: [],
  expand: true,
  maxDepth: 3,
  format: "markdown",
  text: "",
  result: null,
  error: "",
};

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

async function assemblyRequest(url, payload) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) {
      const message = typeof body.error === "string" ? body.error : JSON.stringify(body.error);
      const details = body.details ? ` ${JSON.stringify(body.details)}` : "";
      return { error: `${body.code ? `${body.code}: ` : ""}${message}${details}` };
    }
    return { data: body.data };
  } catch (error) {
    return { error: error && error.message ? error.message : "Request failed" };
  }
}

function applyAssemblyOutcome(outcome) {
  if (outcome.error) {
    assembly.result = null;
    assembly.error = outcome.error;
    return;
  }
  assembly.result = outcome.data;
  assembly.error = "";
}

/** A window only makes sense for one target, so choosing a new target resets it. */
function setAssemblyTarget(fcid) {
  assembly.mode = "assemble";
  assembly.target = fcid;
  assembly.from = "";
  assembly.to = "";
  assembly.roles = [];
}

async function runAssemble() {
  if (assembly.mode === "expand") {
    applyAssemblyOutcome(await assemblyRequest("/v1/lab05/expand", {
      text: assembly.text,
      maxDepth: assembly.maxDepth,
      format: assembly.format,
    }));
    return;
  }

  const target = assembly.target.trim();
  if (!target) {
    assembly.result = null;
    assembly.error = "Informe um alvo (FCAS ou FCID) ou selecione um artefato na arvore.";
    return;
  }
  const payload = { target, expand: assembly.expand, maxDepth: assembly.maxDepth, format: assembly.format };
  if (assembly.from !== "") {
    payload.range = { from: Number(assembly.from) };
    if (assembly.to !== "") payload.range.to = Number(assembly.to);
  } else if (assembly.to !== "") {
    assembly.result = null;
    assembly.error = "Informe 'from' para usar 'to'.";
    return;
  }
  if (assembly.roles.length > 0) payload.roles = assembly.roles;
  applyAssemblyOutcome(await assemblyRequest("/v1/lab05/assemble", payload));
}

function renderAssemblyCenter() {
  const a = assembly;
  const isAssemble = a.mode === "assemble";
  const depthOptions = [1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${a.maxDepth === n ? "selected" : ""}>${n}</option>`).join("");
  const formatOptions = ["markdown", "text"].map((f) => `<option value="${f}" ${a.format === f ? "selected" : ""}>${f}</option>`).join("");

  const form = isAssemble
    ? `<label>Target (FCAS or FCID)</label>
      <input id="asm-target" value="${escapeAttr(a.target)}" placeholder="[[architecture.md#Introduction]] or DC_ABC123" />
      <div class="hint">Click an artifact in the tree to fill the target and assemble it.</div>
      <div class="asm-row">
        <div><label>Range from</label><input id="asm-from" type="number" min="1" value="${escapeAttr(a.from)}" placeholder="1" /></div>
        <div><label>Range to</label><input id="asm-to" type="number" min="1" value="${escapeAttr(a.to)}" placeholder="(end)" /></div>
      </div>
      <div class="asm-checks"><span class="hint">Roles (chats only)</span>${["user", "assistant", "system"].map((role) => `<label class="asm-check"><input type="checkbox" data-asm-role="${role}" ${a.roles.includes(role) ? "checked" : ""} />${role}</label>`).join("")}</div>
      <label class="asm-check"><input type="checkbox" id="asm-expand" ${a.expand ? "checked" : ""} />Expand FCAS references</label>`
    : `<label>Text with FCAS references</label>
      <textarea id="asm-text" placeholder="Intro.&#10;&#10;[[architecture.md#Introduction]]">${escapeHtml(a.text)}</textarea>`;

  const output = a.error
    ? `<div class="asm-error">${escapeHtml(a.error)}</div>`
    : a.result
      ? `<pre>${escapeHtml(a.result.content.length > 0 ? a.result.content : "(empty assembly)")}</pre>`
      : `<div class="hint">Run an assembly to see the result.</div>`;

  return `<h3>Assembly</h3>
    <div class="tabs asm-modes"><button data-asm-mode="assemble" class="${isAssemble ? "active" : ""}">Assemble</button><button data-asm-mode="expand" class="${isAssemble ? "" : "active"}">Expand text</button></div>
    ${form}
    <div class="asm-row">
      <div><label>maxDepth</label><select id="asm-depth">${depthOptions}</select></div>
      <div><label>Format</label><select id="asm-format">${formatOptions}</select></div>
    </div>
    <div class="asm-actions"><button id="asm-run" class="asm-primary">${isAssemble ? "Assemble" : "Expand"}</button>${isAssemble ? `<button id="asm-clear">Clear window</button>` : ""}</div>
    ${output}`;
}

function renderAssemblyDetails() {
  const r = assembly.result;
  if (!r) return `<h3>Manifest</h3><div class="hint">No assembly yet.</div>`;

  const parts = [`<h3>Manifest</h3>`];
  if (r.target) {
    const evolved = r.target.evolvedFrom ? ` <span class="lineage-rel">evolved from ${lineageLink(r.target.evolvedFrom)}</span>` : "";
    parts.push(`<div class="lineage-block"><div class="hint">Target</div><div>${escapeHtml(r.target.type)} ${lineageLink(r.target.fcid)}${evolved}</div></div>`);
  }
  if (r.selection) {
    const roles = r.selection.roles ? `, roles: ${escapeHtml(r.selection.roles.join(", "))}` : "";
    parts.push(`<div class="lineage-block"><div class="hint">Window</div><div>${r.selection.from}&ndash;${r.selection.to} of ${r.selection.total}${roles}</div></div>`);
  }
  parts.push(`<div class="lineage-block"><div class="hint">Stats</div><div>expanded ${r.stats.expanded} &middot; warnings ${r.stats.warnings}</div></div>`);

  if (r.manifest.length > 0) {
    const items = r.manifest.map((entry) => {
      const via = entry.via ? ` <span class="lineage-rel">via ${escapeHtml(entry.via)}</span>` : "";
      const evolved = entry.evolvedFrom ? ` <span class="lineage-rel">evolved from ${lineageLink(entry.evolvedFrom)}</span>` : "";
      return `<li style="margin-left:${entry.depth * 14}px"><span class="badge badge-${entry.role}">${entry.role}</span> ${escapeHtml(entry.type)} ${lineageLink(entry.fcid)}${via}${evolved}</li>`;
    }).join("");
    parts.push(`<div class="lineage-block"><div class="hint">Composed of (${r.manifest.length})</div><ul class="lineage-list">${items}</ul></div>`);
  }

  if (r.warnings.length > 0) {
    const items = r.warnings.map((w) => {
      const candidates = w.candidates ? `<div class="lineage-io">candidates: ${w.candidates.map(lineageLink).join(" ")}</div>` : "";
      return `<li><span class="badge badge-warning">${escapeHtml(w.code)}</span> <code>${escapeHtml(w.fcas)}</code> <span class="hint">depth ${w.depth}</span><div class="hint">${escapeHtml(w.message)}</div>${candidates}</li>`;
    }).join("");
    parts.push(`<div class="lineage-block"><div class="hint">Warnings (${r.warnings.length})</div><ul class="lineage-list">${items}</ul></div>`);
  }
  return parts.join("");
}

function bindAssembly() {
  document.querySelectorAll("[data-asm-mode]").forEach((btn) => btn.onclick = () => {
    assembly.mode = btn.dataset.asmMode;
    assembly.result = null;
    assembly.error = "";
    rerender();
  });

  const run = async () => { await runAssemble(); rerender(); };

  const target = document.getElementById("asm-target");
  if (target) {
    target.oninput = () => { assembly.target = target.value; };
    target.onkeydown = (event) => { if (event.key === "Enter") void run(); };
  }
  const from = document.getElementById("asm-from");
  if (from) from.oninput = () => { assembly.from = from.value; };
  const to = document.getElementById("asm-to");
  if (to) to.oninput = () => { assembly.to = to.value; };
  const text = document.getElementById("asm-text");
  if (text) text.oninput = () => { assembly.text = text.value; };

  document.querySelectorAll("[data-asm-role]").forEach((el) => el.onchange = () => {
    const role = el.dataset.asmRole;
    assembly.roles = el.checked ? [...new Set([...assembly.roles, role])] : assembly.roles.filter((r) => r !== role);
  });
  const expand = document.getElementById("asm-expand");
  if (expand) expand.onchange = () => { assembly.expand = expand.checked; };
  const depth = document.getElementById("asm-depth");
  if (depth) depth.onchange = () => { assembly.maxDepth = Number(depth.value); };
  const format = document.getElementById("asm-format");
  if (format) format.onchange = () => { assembly.format = format.value; };

  const runBtn = document.getElementById("asm-run");
  if (runBtn) runBtn.onclick = () => void run();
  const clear = document.getElementById("asm-clear");
  if (clear) clear.onclick = () => {
    assembly.from = "";
    assembly.to = "";
    assembly.roles = [];
    rerender();
  };
}

function renderChatCenter() {
  const selectedChat = findSelectedChatFcidFromFlat(state.visibleFlat, state.selectedFcid);
  const selectedNode = state.visibleFlat.find((n) => n.fcid === state.selectedFcid) || null;
  const map = byFcidMap(state.visibleFlat);

  let messages = [];
  if (selectedChat) {
    const chatNode = map.get(selectedChat);
    const msNodes = (chatNode ? chatNode.children : []).map((id) => map.get(id)).filter((n) => n && n.type === "MS");
    messages = msNodes.map((ms) => ({ fcid: ms.fcid, role: parseRole(ms), text: buildNodeText(ms.fcid) }));
  }

  const history = messages.length === 0
    ? `<div class="chat-empty">Nenhuma mensagem no chat selecionado.</div>`
    : messages.map((m) => `<div class="chat-msg ${m.role}"><div class="chat-meta">${m.role} - ${m.fcid}</div><div>${escapeHtml(m.text || "(empty)")}</div></div>`).join("");

  const showComposer = selectedNode && selectedNode.type === "CH";
  const showSelectedProjection = selectedNode && selectedNode.type !== "CH";

  return `<div class="chat-col">
    <div class="chat-history">${showSelectedProjection ? `<pre>${escapeHtml(previewValue)}</pre>` : history}</div>
    ${showComposer ? `<div class="chat-compose"><select id="chat-role"><option value="user">user</option><option value="assistant">assistant</option><option value="system">system</option></select><textarea id="chat-message" placeholder="Digite a mensagem em markdown..."></textarea><button id="chat-send">Enviar</button></div>` : ""}
    ${showSelectedProjection ? `<div class="hint">Exibindo somente a projecao do artefato selecionado.</div>` : ""}
  </div>`;
}

function renderFcas() {
  return `<section><h2>FCAS Search</h2><label>FCAS</label><input id="fcas-input" placeholder="[[architecture.md#Introduction]]" /><button id="fcas-parse">Parse</button> <button id="fcas-resolve">Resolve + Project</button><label>Source FCID (optional for reference)</label><input id="fcas-source" placeholder="CH_ABC123" /><button id="fcas-reference">Create reference</button><pre>${escapeHtml(`Parse:\n${parseValue}\n\nResolve:\n${resolveValue}\n\nProjection:\n${targetValue}`)}</pre></section>`;
}

function renderDocumentModal() {
  const parentOptions = state.treeFlat
    .filter((n) => n.type === "PJ" || n.type === "DR")
    .map((n) => `<option value="${n.fcid}">${n.fcid} (${n.type})</option>`)
    .join("");

  return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>${state.modal === "import-directory" ? "Import Directory" : state.modal === "create-chat" ? "Create Chat" : "Import Document"}</h2><button id="close-modal">Close</button></div>${state.modal === "import-directory" ? `<section><label>Name</label><input id="dir-title" placeholder="Docs Dir" /><label>Parent (Project or Directory)</label><select id="dir-parent"><option value="">Workspace (default)</option>${parentOptions}</select><label>Directory Uploader (.md/.txt)</label><input id="dir-files" type="file" accept=".md,.txt,text/markdown,text/plain" webkitdirectory directory multiple /><label>Documents (JSON array)</label><textarea id="dir-docs" placeholder='[{"resourceKey":"docs/a.md","title":"A","text":"# Intro\\nA."}]'></textarea><button id="dir-submit">Import directory</button></section>` : state.modal === "create-chat" ? `<section><label>Chat Key</label><input id="chat-key" placeholder="::retrieval-chat" /><label>Title</label><input id="chat-title" placeholder="Retrieval Chat" /><button id="chat-submit">Create chat</button></section>` : `<section><label>Parent (Project or Directory)</label><select id="doc-parent"><option value="">Workspace (default)</option>${parentOptions}</select><label>Uploader (.md/.txt)</label><input id="doc-file" type="file" accept=".md,.txt,text/markdown,text/plain" /><label>Name</label><input id="doc-title" placeholder="Architecture" /><label>Resource Key</label><input id="doc-resource" placeholder="docs/architecture.md" /><label>Markdown</label><textarea id="doc-markdown" placeholder="# Intro&#10;Text."></textarea><button id="doc-submit">Import document</button></section>`}</div></div>`;
}

function projectOptions() {
  return state.treeFlat
    .filter((n) => n.type === "WS" || n.type === "PJ")
    .map((node) => `<option value="${node.fcid}" ${state.selectedProjectFcid === node.fcid ? "selected" : ""}>${node.type === "WS" ? `${node.fcid} (workspace)` : node.fcid}</option>`)
    .join("");
}

async function selectFcid(fcid) {
  state.selectedFcid = fcid;
  const inAssembly = state.activePanel === "assembly";
  if (inAssembly) setAssemblyTarget(fcid);
  await Promise.all([refreshProjection(), refreshInspector()]);
  if (inAssembly) await runAssemble();
  rerender();
}

async function refreshAll() {
  await loadTree();
  setVisibleFlat();
  await Promise.all([refreshProjection(), refreshInspector()]);
  rerender();
}

function bindDom() {
  document.querySelectorAll("[data-panel]").forEach((btn) => btn.onclick = () => {
    state.activePanel = btn.dataset.panel;
    if (state.activePanel === "assembly" && !assembly.target && state.selectedFcid) assembly.target = state.selectedFcid;
    setVisibleFlat();
    rerender();
  });

  bindAssembly();

  document.querySelectorAll("[data-lineage-select]").forEach((el) => el.onclick = () => {
    void selectFcid(el.dataset.lineageSelect || "");
  });

  const reset = document.getElementById("reset-seeds");
  if (reset) reset.onclick = async () => { await api.resetSeeds(); state.selectedFcid = null; state.toast = ""; await refreshAll(); };

  const format = document.getElementById("projection-format");
  if (format) format.onchange = async () => { state.projectionFormat = format.value; await refreshProjection(); rerender(); };

  const docSubmit = document.getElementById("doc-submit");
  if (docSubmit) docSubmit.onclick = async () => {
    await api.importDocument({
      title: document.getElementById("doc-title").value.trim(),
      resourceKey: document.getElementById("doc-resource").value.trim(),
      text: document.getElementById("doc-markdown").value,
      parentFcid: document.getElementById("doc-parent").value.trim() || undefined,
    });
    state.modal = null;
    await refreshAll();
  };

  const docFile = document.getElementById("doc-file");
  if (docFile) docFile.onchange = async () => {
    const file = docFile.files && docFile.files[0] ? docFile.files[0] : null;
    if (!file) return;
    const fileText = await file.text();
    const fullName = file.name || "document.md";
    const dot = fullName.lastIndexOf(".");
    const baseName = dot > 0 ? fullName.slice(0, dot) : fullName;

    const titleInput = document.getElementById("doc-title");
    const resourceInput = document.getElementById("doc-resource");
    const markdownInput = document.getElementById("doc-markdown");

    if (titleInput && !titleInput.value.trim()) titleInput.value = baseName;
    if (resourceInput && !resourceInput.value.trim()) resourceInput.value = `docs/${fullName}`;
    if (markdownInput) markdownInput.value = fileText;
  };

  const dirSubmit = document.getElementById("dir-submit");
  if (dirSubmit) dirSubmit.onclick = async () => {
    await api.importDirectory({
      title: document.getElementById("dir-title").value.trim(),
      parentFcid: document.getElementById("dir-parent").value.trim() || undefined,
      documents: JSON.parse(document.getElementById("dir-docs").value.trim()),
    });
    state.modal = null;
    await refreshAll();
  };

  const dirFiles = document.getElementById("dir-files");
  if (dirFiles) dirFiles.onchange = async () => {
    const files = Array.from(dirFiles.files || []);
    if (files.length === 0) return;

    const docs = [];
    for (const file of files) {
      const fullName = file.name || "document.md";
      const lower = fullName.toLowerCase();
      if (!lower.endsWith(".md") && !lower.endsWith(".txt")) continue;
      const text = await file.text();
      const dot = fullName.lastIndexOf(".");
      const baseName = dot > 0 ? fullName.slice(0, dot) : fullName;
      const rel = file.webkitRelativePath || fullName;
      docs.push({
        resourceKey: `docs/${rel.replaceAll("\\\\", "/")}`,
        title: baseName,
        text,
      });
    }

    const dirDocs = document.getElementById("dir-docs");
    const dirTitle = document.getElementById("dir-title");
    if (dirDocs) dirDocs.value = JSON.stringify(docs, null, 2);
    if (dirTitle && !dirTitle.value.trim()) {
      const firstRel = files[0].webkitRelativePath || "";
      const topFolder = firstRel.includes("/") ? firstRel.split("/")[0] : "Imported Directory";
      dirTitle.value = topFolder || "Imported Directory";
    }
  };

  const chatSubmit = document.getElementById("chat-submit");
  if (chatSubmit) chatSubmit.onclick = async () => {
    await api.createChat(document.getElementById("chat-key").value.trim(), document.getElementById("chat-title").value.trim());
    state.modal = null;
    await refreshAll();
  };

  const closeModal = document.getElementById("close-modal");
  if (closeModal) closeModal.onclick = () => { state.modal = null; rerender(); };

  const parseBtn = document.getElementById("fcas-parse");
  if (parseBtn) parseBtn.onclick = async () => {
    const fcas = document.getElementById("fcas-input").value.trim();
    try { parseValue = JSON.stringify(await api.parseFcas(fcas), null, 2); } catch (e) { parseValue = e.message; }
    rerender();
  };

  const resolveBtn = document.getElementById("fcas-resolve");
  if (resolveBtn) resolveBtn.onclick = async () => {
    const fcas = document.getElementById("fcas-input").value.trim();
    try {
      const resolved = await api.resolveFcas(fcas);
      resolveValue = JSON.stringify(resolved, null, 2);
      state.selectedFcid = resolved.targetFcid;
      await Promise.all([refreshProjection(), refreshInspector()]);
      targetValue = `Selected ${resolved.targetFcid} and projected in ${state.projectionFormat}.`;
    } catch (e) { resolveValue = e.message; }
    rerender();
  };

  const refBtn = document.getElementById("fcas-reference");
  if (refBtn) refBtn.onclick = async () => {
    try {
      await api.createReference(document.getElementById("fcas-source").value.trim(), document.getElementById("fcas-input").value.trim());
      targetValue = "Reference created.";
    } catch (e) { targetValue = e.message; }
    rerender();
  };

  const chatSend = document.getElementById("chat-send");
  if (chatSend) chatSend.onclick = async () => {
    const node = state.visibleFlat.find((n) => n.fcid === state.selectedFcid);
    if (!node || node.type !== "CH") return;
    const role = document.getElementById("chat-role").value;
    const text = document.getElementById("chat-message").value;
    if (!text.trim()) return;
    await api.addMessage(node.fcid, { role, text });
    await refreshAll();
  };
}

async function copyFcasReference(fcid) {
  try {
    const result = await api.projectFcas(fcid);
    await navigator.clipboard.writeText(result.fcas);
    state.toast = "Reference copied";
  } catch (error) {
    state.toast = error && error.message ? error.message : "Copy failed";
  }
}

function render() {
  const title = state.activePanel === "chat" ? "Chat View" : state.activePanel === "fcas" ? "FCAS Search" : state.activePanel === "assembly" ? "Assembly View" : "Document View";
  const subtitle = state.activePanel === "chat"
    ? "Explore e projete chats e mensagens"
    : state.activePanel === "fcas"
      ? "Parse, resolve e projete referencias FCAS"
      : state.activePanel === "assembly"
        ? "Monte views completas ou parciais e expanda referencias FCAS"
        : "Explore e projete artefatos de documentos";

  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = `<div class="app">
    <div class="workspace">
      <header class="header">
        <div><strong>${title}</strong><div class="hint">${subtitle}</div></div>
        <div class="right"><span class="status-chip ${apiStatus === "online" ? "" : "offline"}">${apiStatus}</span><button id="reset-seeds">Reset Seeds</button></div>
      </header>
      <main class="main">
        <section class="panel">
          <div class="panel-head"><div class="tabs"><button data-panel="document" class="${state.activePanel === "document" ? "active" : ""}">Document</button><button data-panel="chat" class="${state.activePanel === "chat" ? "active" : ""}">Chat</button><button data-panel="fcas" class="${state.activePanel === "fcas" ? "active" : ""}">FCAS</button><button data-panel="assembly" class="${state.activePanel === "assembly" ? "active" : ""}">Assembly</button></div><div>${state.toast ? `<span class="toast">${state.toast}</span>` : ""}</div></div>
          <div class="panel-grid">
            <div class="panel-col">
              ${state.activePanel === "fcas" ? `<h3>FCAS Search</h3>${renderFcas()}` : state.activePanel === "document" ? `<div class="col-actions"><h3>Arvore de Artefatos</h3><div class="right"><button id="open-import-document">Import Document</button><button id="open-import-directory">Import Directory</button></div></div>` : state.activePanel === "assembly" ? `<div class="col-actions"><h3>Arvore de Artefatos</h3></div>` : `<div class="col-actions"><h3>Arvore de Artefatos</h3><div class="right"><button id="open-create-chat">Create Chat</button></div></div>`}
              ${state.activePanel === "fcas" ? "" : renderTree((fcid) => selectFcid(fcid), (fcid) => copyFcasReference(fcid).then(render))}
            </div>
            <div class="panel-col">
              ${state.activePanel === "chat" ? renderChatCenter() : state.activePanel === "assembly" ? renderAssemblyCenter() : `<h3>Projecao</h3><label>Format</label><select id="projection-format"><option value="markdown" ${state.projectionFormat === "markdown" ? "selected" : ""}>markdown</option><option value="text" ${state.projectionFormat === "text" ? "selected" : ""}>text</option><option value="json" ${state.projectionFormat === "json" ? "selected" : ""}>json</option></select><pre>${escapeHtml(previewValue)}</pre>`}
            </div>
            <div class="panel-col">
              ${state.activePanel === "assembly" ? renderAssemblyDetails() : `<h3 style="margin-top:12px;">Inspector</h3><pre>${escapeHtml(inspectorValue)}</pre>
              ${renderLineage()}`}
            </div>
          </div>
        </section>
      </main>
    </div>
    ${state.modal ? renderDocumentModal() : ""}
  </div>`;

  bindDom();

  const openImportDocument = document.getElementById("open-import-document");
  if (openImportDocument) openImportDocument.onclick = () => { state.modal = "import-document"; render(); };
  const openImportDirectory = document.getElementById("open-import-directory");
  if (openImportDirectory) openImportDirectory.onclick = () => { state.modal = "import-directory"; render(); };
  const openCreateChat = document.getElementById("open-create-chat");
  if (openCreateChat) openCreateChat.onclick = () => { state.modal = "create-chat"; render(); };
}

function rerender() {
  setVisibleFlat();
  render();
}

async function init() {
  try {
    const healthStatus = await api.health();
    apiStatus = healthStatus.status === "ok" ? "online" : "offline";
  } catch {
    apiStatus = "offline";
  }
  await refreshAll();
}

void init();
