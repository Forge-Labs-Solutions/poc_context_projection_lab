import { state, type ExplorerArtifact } from "./state.js";

function byTypeOrder(a: ExplorerArtifact, b: ExplorerArtifact): number {
  const order = ["WS", "PJ", "DR", "DC", "CH", "MS", "SS", "PG", "SN"];
  const ai = order.indexOf(a.type);
  const bi = order.indexOf(b.type);
  if (ai !== bi) return ai - bi;
  return a.fcid.localeCompare(b.fcid);
}

export function renderTree(onSelect: (fcid: string) => void, onCopyFcas: (fcid: string) => void): string {
  const nodes = state.explorer;
  const byFcid = new Map(nodes.map((n) => [n.fcid, n]));
  const roots = nodes
    .filter((n) => n.parent.length === 0 || !n.parent.some((p) => byFcid.has(p)))
    .sort(byTypeOrder);

  const renderNode = (fcid: string): string => {
    const node = byFcid.get(fcid);
    if (!node) return "";
    const expanded = state.expandedNodes.has(node.fcid);
    const selected = state.selectedFcid === node.fcid ? "active" : "";
    const children = node.children
      .map((c) => byFcid.get(c))
      .filter((x): x is ExplorerArtifact => Boolean(x))
      .sort(byTypeOrder);
    const toggle = children.length > 0 ? (expanded ? "▼" : "▶") : "•";
    const inner = expanded && children.length > 0 ? `<ul>${children.map((c) => renderNode(c.fcid)).join("")}</ul>` : "";
    return `<li>
      <div class="tree-node">
        <button data-toggle="${node.fcid}" class="select-node">${toggle}</button>
        <button data-select="${node.fcid}" class="select-node ${selected}">${node.type}</button>
        <span class="tree-fcid">${node.fcid}</span>
        <button data-copy="${node.fcid}" title="Copy FCAS">Copy</button>
      </div>
      ${inner}
    </li>`;
  };

  queueMicrotask(() => {
    document.querySelectorAll<HTMLButtonElement>("[data-toggle]").forEach((el) => {
      el.onclick = () => {
        const fcid = el.dataset.toggle ?? "";
        if (state.expandedNodes.has(fcid)) state.expandedNodes.delete(fcid);
        else state.expandedNodes.add(fcid);
        document.dispatchEvent(new CustomEvent("ui:rerender"));
      };
    });
    document.querySelectorAll<HTMLButtonElement>("[data-select]").forEach((el) => {
      el.onclick = () => {
        const fcid = el.dataset.select ?? "";
        onSelect(fcid);
      };
    });
    document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((el) => {
      el.onclick = () => {
        const fcid = el.dataset.copy ?? "";
        onCopyFcas(fcid);
      };
    });
  });

  return `<div class="tree"><ul>${roots.map((n) => renderNode(n.fcid)).join("")}</ul></div>`;
}
