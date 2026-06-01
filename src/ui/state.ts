export type ProjectionFormat = "markdown" | "text" | "json";
export type PanelType = "document" | "chat" | "fcas";

export type ExplorerArtifact = {
  fcid: string;
  type: string;
  category: string;
  state: string;
  parent: string[];
  children: string[];
  references: Array<{ referenceId: string; targetFcid: string; fcasRaw: string }>;
};

export type UiState = {
  selectedFcid: string | null;
  selectedProjectFcid: string | null;
  projectionFormat: ProjectionFormat;
  expandedNodes: Set<string>;
  activePanel: PanelType;
  explorer: ExplorerArtifact[];
  toast: string;
};

export const state: UiState = {
  selectedFcid: null,
  selectedProjectFcid: null,
  projectionFormat: "markdown",
  expandedNodes: new Set<string>(),
  activePanel: "document",
  explorer: [],
  toast: "",
};
