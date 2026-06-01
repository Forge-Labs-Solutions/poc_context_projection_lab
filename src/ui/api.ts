import type { ExplorerArtifact, ProjectionFormat } from "./state.js";

type ApiEnvelope<T> = { data: T } | { error: unknown } | { status: string; message?: string };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || "error" in body) {
    throw new Error(typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : "Request failed");
  }
  if ("data" in body) return body.data;
  return body as unknown as T;
}

export function health(): Promise<{ status: string }> {
  return request<{ status: string }>("/health");
}

export function resetSeeds(): Promise<{ status: string; message: string }> {
  return request<{ status: string; message: string }>("/v1/seeds/reset", { method: "POST" });
}

export function explorerArtifacts(): Promise<ExplorerArtifact[]> {
  return request<ExplorerArtifact[]>("/v1/lab01/explorer/artifacts");
}

export function artifactByFcid(fcid: string): Promise<{
  fcid: string;
  type: string;
  category: string;
  state: string;
  metadataJson: string | null;
  createdAt: number;
  updatedAt: number;
}> {
  return request(`/v1/artifacts/${encodeURIComponent(fcid)}`);
}

export function explorerByFcid(fcid: string): Promise<ExplorerArtifact> {
  return request(`/v1/lab01/explorer/artifacts/${encodeURIComponent(fcid)}`);
}

export function projectArtifact(artifactFcid: string, targetFormat: ProjectionFormat): Promise<{
  artifactFcid: string;
  scope: string;
  targetFormat: ProjectionFormat;
  content?: string;
  structured?: unknown;
}> {
  return request("/v1/lab02/project", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ artifactFcid, targetFormat }),
  });
}

export function projectFcas(targetFcid: string): Promise<{ targetFcid: string; fcas: string }> {
  return request("/v1/lab03/project-fcas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetFcid }),
  });
}

export function parseFcas(fcas: string): Promise<unknown> {
  return request("/v1/lab03/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fcas }),
  });
}

export function resolveFcas(fcas: string): Promise<{ parsed: unknown; targetFcid: string }> {
  return request("/v1/lab03/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fcas }),
  });
}

export function createReference(sourceFcid: string, fcas: string): Promise<unknown> {
  return request("/v1/lab03/references", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceFcid, fcas }),
  });
}

export function importDocument(payload: { resourceKey: string; title: string; text: string; parentFcid?: string }): Promise<{ rootFcid: string; projectionId: string }> {
  return request("/v1/lab01/import/document", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function importDirectory(payload: {
  title: string;
  parentFcid?: string;
  documents: Array<{ resourceKey: string; title: string; text: string }>;
}): Promise<unknown> {
  return request("/v1/lab01/import/directory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function createChat(resourceKey: string, title: string): Promise<{ chatFcid: string; projectionId: string }> {
  return request("/v1/lab01/chat/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resourceKey, title }),
  });
}

export function addMessage(chatFcid: string, payload: { role: "user" | "assistant" | "system"; text: string }): Promise<{ messageFcid: string }> {
  return request(`/v1/lab01/chat/${encodeURIComponent(chatFcid)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
