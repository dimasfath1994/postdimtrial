import { guardCollaborationAccess } from "./collab-auth-guard.js";
import { initWorkspaceUI } from "./workspace-ui.js";

initWorkspaceUI();

import { Tabs } from "../ui/tabs.js";
import { RequestEngine } from "../core/request-engine.js";
import { CollectionManager } from "../core/collection.js";
import { Environment } from "../core/environment.js";
import { ContextMenu } from "../ui/context-menu.js";
import { SyncService } from "../core/sync/sync-service.js";
import { WorkspaceService } from "./workspace-service.js";
import { CollectionService } from "./collection-service.js";
import { Auth } from "../auth.js";

// ================= UI =================
const ui = {
  method: document.getElementById("method"),
  url: document.getElementById("url"),
  body: document.getElementById("body"),
  send: document.getElementById("send"),
  response: document.getElementById("response"),
  statusBar: document.getElementById("statusBar"),
  tabsEl: document.getElementById("tabs"),
  collectionList: document.getElementById("collectionList")
};

// ================= CORE =================
const ctx = new ContextMenu();
const tabs = new Tabs(ui);
const collections = new CollectionManager();

// ================= STATE =================
const State = {
  workspaceId: null,
  workspace: null,
  applyingRemote: false,
  saveTimer: null,
  collections: []
};

// ================= SYNC =================
const sync = new SyncService({
  onUpdate: (data) => hydrateState(data, true)
});

// ================= BOOT =================
document.addEventListener("DOMContentLoaded", bootstrap);

async function bootstrap() {

  const allowed = await guardCollaborationAccess();
  if (!allowed) return;

  await loadUserUI();
  await loadWorkspaceFlow();
  await loadWorkspaceSwitcher();

  bindUI();
  startAutoSync();
}

// ================= USER UI =================
async function loadUserUI() {
  const bar = document.getElementById("collabUserBar");
  const email = document.getElementById("collabUserEmail");

  const user = Auth.getUser?.();
  if (!user) return;

  bar.style.display = "block";
  email.textContent = user.email;
}

// ================= WORKSPACE =================
async function loadWorkspaceFlow() {
  const list = await WorkspaceService.getMyWorkspaces();

  console.log("[RAW WORKSPACE LIST]", list);

  let ws;

  if (!list.length) {
    ws = await WorkspaceService.createWorkspace("My Workspace");
  } else {
    ws = await WorkspaceService.getWorkspace(list[0].id);
  }

  console.log("[WORKSPACE SELECTED]", ws);

  State.workspaceId = ws.id;
  State.workspace = ws;

  hydrateState(ws.data || {});

  await loadCollections(State.workspaceId);
}

// ================= COLLECTION =================
async function loadCollections(workspaceId) {

  if (!workspaceId) {
    console.warn("[COLLECTION] workspaceId missing");
    return;
  }

  try {
    const cols = await CollectionService.getByWorkspace(workspaceId);

    console.log("[COLLECTION API]", cols);

    State.collections = cols;
    renderCollections(cols);

  } catch (err) {
    console.error("[COLLECTION LOAD ERROR]", err);
  }
}

// ================= SWITCH WORKSPACE =================
async function loadWorkspaceSwitcher() {
  const select = document.getElementById("workspaceSwitcher");
  if (!select) return;

  const list = await WorkspaceService.getMyWorkspaces();

  select.innerHTML = "";

  list.forEach(ws => {
    const opt = document.createElement("option");
    opt.value = ws.id;
    opt.textContent = ws.name;
    if (ws.id === State.workspaceId) opt.selected = true;
    select.appendChild(opt);
  });

  select.onchange = async (e) => {

    const id = Number(e.target.value);
    if (!id) return;

    const ws = await WorkspaceService.getWorkspace(id);

    State.workspaceId = ws.id;
    State.workspace = ws;

    hydrateState(ws.data || {});

    await loadCollections(State.workspaceId);

    console.log("[WORKSPACE SWITCHED]", ws);
  };
}

// ================= RENDER =================
function renderCollections(list = []) {

  const container = document.getElementById("collectionList");
  if (!container) return;

  container.innerHTML = "";

  list.forEach(col => {
    const div = document.createElement("div");
    div.className = "collection-item";
    div.textContent = col.name;
    container.appendChild(div);
  });
}

// ================= HYDRATE =================
function hydrateState(data) {

  State.applyingRemote = true;

  try {

    if (Array.isArray(data.tabs)) {
      tabs.tabs = structuredClone(data.tabs);
      tabs.activeId = data.activeId || data.tabs[0]?.id;
      tabs.render();
      tabs.syncForm();
    }

    if (Array.isArray(data.collections)) {
      State.collections = data.collections;
    }

    if (data.environment) {
      Environment.clear?.();
      Object.entries(data.environment).forEach(([k, v]) => {
        Environment.set(k, v);
      });
    }

  } finally {
    State.applyingRemote = false;
  }
}

// ================= UI =================
function bindUI() {

  document.getElementById("collabLogoutBtn")
    ?.addEventListener("click", logout);

  document.getElementById("newTab")
    ?.addEventListener("click", () => {
      scheduleSave();
      tabs.create();
    });

  ui.send?.addEventListener("click", sendRequest);

  // ================= FIX CREATE COLLECTION =================
  document.getElementById("newCollection")
    ?.addEventListener("click", async () => {

      if (!State.workspaceId) {
        alert("Workspace belum siap");
        return;
      }

      const name = prompt("Collection name?");
      if (!name) return;

      await CollectionService.create(State.workspaceId, name);

      await loadCollections(State.workspaceId);
      scheduleSave();
    });

  // ================= REQUEST =================
  document.getElementById("addRequest")
    ?.addEventListener("click", () => {

      const active = tabs.getActive?.();
      if (!active) return;

      active.requests = active.requests || [];

      active.requests.push({
        id: Date.now(),
        name: "New Request"
      });

      tabs.render?.();
      scheduleSave();
    });
}

// ================= REQUEST =================
async function sendRequest() {

  const start = performance.now();

  const res = await RequestEngine.send({
    method: ui.method.value,
    url: ui.url.value,
    body: getBody(),
    headers: {}
  });

  renderResponse(res, performance.now() - start);
}

// ================= SAVE =================
function scheduleSave() {
  clearTimeout(State.saveTimer);
  State.saveTimer = setTimeout(save, 300);
}

function save() {
  if (State.applyingRemote) return;
  if (!State.workspaceId) return;

  const payload = buildState();

  WorkspaceService.updateWorkspace(State.workspaceId, {
    data: payload
  }).catch(console.error);

  sync.send(payload);
}

// ================= BUILD =================
function buildState() {
  return {
    tabs: tabs.tabs,
    activeId: tabs.activeId,
    collections: State.collections || [],
    environment: Environment.getAll()
  };
}

// ================= AUTO SYNC =================
function startAutoSync() {
  setInterval(() => scheduleSave(), 2000);
}

// ================= HELPERS =================
function getBody() {
  const tab = tabs.getActive?.();
  return tab?.body || null;
}

// ================= RESPONSE =================
function renderResponse(res, time) {

  ui.response.innerHTML = "";

  const meta = document.createElement("div");
  meta.textContent = `${Math.round(time)}ms`;

  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify(res.data, null, 2);

  ui.response.appendChild(meta);
  ui.response.appendChild(pre);
}

// ================= LOGOUT =================
function logout() {
  Auth.logout?.();
  window.location.replace("/login.html");
}

window.__COLLAB_MODE__ = true;