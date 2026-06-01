import { createChat, addMessage, importDirectory, importDocument } from "./api.js";
import { state } from "./state.js";

export function renderForms(): string {
  return `<div>
    <div class="tabs">
      <button data-panel="document" class="${state.activePanel === "document" ? "active" : ""}">Document View</button>
      <button data-panel="chat" class="${state.activePanel === "chat" ? "active" : ""}">Chat View</button>
      <button data-panel="fcas" class="${state.activePanel === "fcas" ? "active" : ""}">FCAS Search</button>
    </div>
    ${state.activePanel === "document" ? documentForm() : ""}
    ${state.activePanel === "chat" ? chatForm() : ""}
  </div>`;
}

function documentForm(): string {
  return `<section>
    <h2>Import Document</h2>
    <label>Name</label>
    <input id="doc-title" placeholder="Architecture" />
    <label>Resource Key</label>
    <input id="doc-resource" placeholder="docs/architecture.md" />
    <label>Parent Directory (optional DR_*)</label>
    <input id="doc-parent" placeholder="DR_ABC123" />
    <label>Markdown</label>
    <textarea id="doc-markdown" placeholder="# Intro&#10;Text."></textarea>
    <button id="doc-submit">Import document</button>
    <hr />
    <h2>Import Directory</h2>
    <label>Name</label>
    <input id="dir-title" placeholder="Docs Dir" />
    <label>Parent Directory (optional DR_*)</label>
    <input id="dir-parent" placeholder="DR_ABC123" />
    <label>Documents (JSON array)</label>
    <textarea id="dir-docs" placeholder='[{"resourceKey":"docs/a.md","title":"A","text":"# Intro\\nA."}]'></textarea>
    <button id="dir-submit">Import directory</button>
    <p class="hint">Use parent DR_* to import nested directories.</p>
  </section>`;
}

function chatForm(): string {
  return `<section>
    <h2>Create Chat</h2>
    <label>Chat Key</label>
    <input id="chat-key" placeholder="::retrieval-chat" />
    <label>Title</label>
    <input id="chat-title" placeholder="Retrieval Chat" />
    <button id="chat-submit">Create chat</button>
    <hr />
    <h2>Add Message</h2>
    <label>Chat FCID</label>
    <input id="msg-chat-fcid" placeholder="CH_ABC123" />
    <label>Role</label>
    <select id="msg-role"><option value="user">user</option><option value="assistant">assistant</option><option value="system">system</option></select>
    <label>Markdown</label>
    <textarea id="msg-text" placeholder="# Answer&#10;Sentence 1. Sentence 2."></textarea>
    <button id="msg-submit">Add message</button>
  </section>`;
}

export function bindForms(refreshAll: () => Promise<void>): void {
  document.querySelectorAll<HTMLButtonElement>("[data-panel]").forEach((btn) => {
    btn.onclick = () => {
      state.activePanel = (btn.dataset.panel as "document" | "chat" | "fcas") ?? "document";
      document.dispatchEvent(new CustomEvent("ui:rerender"));
    };
  });

  const docSubmit = document.getElementById("doc-submit") as HTMLButtonElement | null;
  if (docSubmit) {
    docSubmit.onclick = async () => {
      const title = (document.getElementById("doc-title") as HTMLInputElement).value.trim();
      const resourceKey = (document.getElementById("doc-resource") as HTMLInputElement).value.trim();
      const parentFcid = (document.getElementById("doc-parent") as HTMLInputElement).value.trim();
      const text = (document.getElementById("doc-markdown") as HTMLTextAreaElement).value;
      await importDocument({ title, resourceKey, text, parentFcid: parentFcid || undefined });
      await refreshAll();
    };
  }

  const dirSubmit = document.getElementById("dir-submit") as HTMLButtonElement | null;
  if (dirSubmit) {
    dirSubmit.onclick = async () => {
      const title = (document.getElementById("dir-title") as HTMLInputElement).value.trim();
      const parentFcid = (document.getElementById("dir-parent") as HTMLInputElement).value.trim();
      const docsRaw = (document.getElementById("dir-docs") as HTMLTextAreaElement).value.trim();
      const documents = JSON.parse(docsRaw) as Array<{ resourceKey: string; title: string; text: string }>;
      await importDirectory({ title, documents, parentFcid: parentFcid || undefined });
      await refreshAll();
    };
  }

  const chatSubmit = document.getElementById("chat-submit") as HTMLButtonElement | null;
  if (chatSubmit) {
    chatSubmit.onclick = async () => {
      const resourceKey = (document.getElementById("chat-key") as HTMLInputElement).value.trim();
      const title = (document.getElementById("chat-title") as HTMLInputElement).value.trim();
      await createChat(resourceKey, title);
      await refreshAll();
    };
  }

  const msgSubmit = document.getElementById("msg-submit") as HTMLButtonElement | null;
  if (msgSubmit) {
    msgSubmit.onclick = async () => {
      const chatFcid = (document.getElementById("msg-chat-fcid") as HTMLInputElement).value.trim();
      const role = (document.getElementById("msg-role") as HTMLSelectElement).value as "user" | "assistant" | "system";
      const text = (document.getElementById("msg-text") as HTMLTextAreaElement).value;
      await addMessage(chatFcid, { role, text });
      await refreshAll();
    };
  }
}
