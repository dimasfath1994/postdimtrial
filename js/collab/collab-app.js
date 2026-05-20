import { guardCollaborationAccess } from "./collab-auth-guard.js";
import { initWorkspaceUI } from "./workspace-ui.js";

document.addEventListener("DOMContentLoaded", () => {
  initWorkspaceUI();
});

import { Tabs } from "../ui/tabs-collab.js";
import { RequestEngine } from "../core/request-engine.js";
import { CollectionManager } from "../core/collection.js";
import { Environment } from "../core/environment.js";
import { ContextMenu } from "../ui/context-menu.js";
import { SyncService } from "../core/sync/sync-service.js";
import { WorkspaceService } from "./workspace-service.js";
import { CollectionService } from "./collection-service.js";
import { CollabTabsController } from "./collab-tabs-controller.js";
import { RequestSync } from "../core/sync/request-sync.js";
import { WorkspaceSync } from "../core/sync/workspace-sync.js";
import { CollectionSync } from "../core/sync/collection-sync.js";
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
// ================= STATE =================
const State = {
  workspaceId: null,
  workspace: null,
  applyingRemote: false,
  saveTimer: null,
  collections: []
};



// ================= CORE =================
const ctx = new ContextMenu();
const tabs = new Tabs(ui);
const oldSetActive =
  tabs.setActive.bind(tabs);

tabs.setActive = function(id) {

  scheduleSave();

  oldSetActive(id);

};

const collections = new CollectionManager();
const tabsController = new CollabTabsController({
  tabs,
  state: State,
  collectionService: CollectionService,
  environment: Environment
});



// ================= REALTIME SYNC =================

window.__workspaceSync =
  new WorkspaceSync({

    state: State,

    renderWorkspaces:
      loadWorkspaceSwitcher

  });

window.__workspaceSync.start();


window.__collectionSync =
  new CollectionSync({

    state: State,

    tabsController

  });


const requestSync =
  new RequestSync(
    tabsController
  );

requestSync.start();

// ================= SAFE ID =================
function extractId(value) {

  if (value == null) return null;

  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  if (typeof value === "object") {
    const candidates = [
      value.id,
      value.workspace_id,
      value.activeId,
      value.value,
      value._id,
      value?.id?.value,
      value?.id?.$numberLong
    ];

    for (const c of candidates) {
      const n = Number(c);
      if (Number.isFinite(n)) return n;
    }
  }

  return null;
}

// ================= RENDER ACTIVE WORKSPACE UI (FIX UTAMA) =================
function renderActiveWorkspace(ws) {

  const el =
    document.getElementById(
      "activeWorkspaceName"
    );

  if (!el) return;

  const fromList =
    State.workspaceList
    ?.find(
      w =>
        Number(w.id)
        === Number(ws?.id)
    );

  const name =

    fromList?.name ??

    ws?.name ??

    ws?.title ??

    ws?.workspace_name ??

    ws?.data?.name ??

    "Unnamed Workspace";

  el.textContent = name;

  // REBIND RIGHT CLICK
  initWorkspaceContextMenu();

}



function initWorkspaceContextMenu() {

  const el =
    document.getElementById(
      "activeWorkspaceName"
    );

  if (!el) return;

  let menu =
    document.getElementById(
      "workspaceContextMenu"
    );

  if (!menu) {

    menu =
      document.createElement(
        "div"
      );

    menu.id =
      "workspaceContextMenu";

    menu.style.position =
      "fixed";

    menu.style.display =
      "none";

    menu.style.background =
      "#1e1e1e";

    menu.style.border =
      "1px solid #333";

    menu.style.borderRadius =
      "8px";

    menu.style.minWidth =
      "140px";

    menu.style.zIndex =
      "999999";

    document.body
      .appendChild(menu);

  }

  el.oncontextmenu =
    (e)=>{

    e.preventDefault();

    menu.innerHTML="";

    // ================= RENAME =================

    const rename =
      document.createElement(
        "div"
      );

    rename.textContent =
      "Rename";

    rename.style.padding =
      "10px";

    rename.style.cursor =
      "pointer";

    rename.onclick =
      async ()=>{

      menu.style.display =
        "none";

      const newName =
        prompt(
          "Workspace name"
        );

      if(!newName)
        return;

      try{

        await WorkspaceService
          .updateWorkspace(

            State.workspaceId,

            {
              name:newName
            }

          );

        const item =
          State.workspaceList
          ?.find(

            w=>
              Number(w.id)
              === Number(
                State.workspaceId
              )

          );

        if(item){

          item.name =
            newName;

        }

        renderActiveWorkspace({

          id:
            State.workspaceId,

          name:
            newName

        });

        await loadWorkspaceSwitcher();

      }
      catch(err){

        console.error(
          err
        );

      }

    };

    // ================= DELETE =================

    const del =
      document.createElement(
        "div"
      );

    del.textContent =
      "Delete";

    del.style.padding =
      "10px";

    del.style.cursor =
      "pointer";

    del.onclick =
      async ()=>{

      menu.style.display =
        "none";

      try{

        await WorkspaceService
          .deleteWorkspace(
            State.workspaceId
          );

        await loadWorkspaceFlow();

        await loadWorkspaceSwitcher();

      }
      catch(err){

        console.error(
          err
        );

      }

    };

    menu.appendChild(
      rename
    );

    menu.appendChild(
      del
    );

    menu.style.left =
      `${e.clientX}px`;

    menu.style.top =
      `${e.clientY}px`;

    menu.style.display =
      "block";

  };

  document.onclick =
    ()=>{

    menu.style.display =
      "none";

  };

}




function initTabContextMenu(){

                  window.__openTabMenu=
                  (e,tab)=>{

                    let menu=
                    document.getElementById(
                    "tabContextMenu"
                    );

                    if(!menu){

                    menu=
                    document.createElement(
                    "div"
                    );

                    menu.id=
                    "tabContextMenu";

                    menu.style.position=
                    "fixed";

                    menu.style.background=
                    "#1e1e1e";

                    menu.style.border=
                    "1px solid #333";

                    menu.style.borderRadius=
                    "8px";

                    menu.style.minWidth=
                    "180px";

                    menu.style.zIndex=
                    "999999";

                    document.body
                    .appendChild(
                    menu
                    );

                    }

                    menu.innerHTML="";

                    const addItem=
                    (
                    label,
                    fn
                    )=>{

                    const el=
                    document.createElement(
                    "div"
                    );

                    el.textContent=
                    label;

                    el.style.padding=
                    "10px";

                    el.style.cursor=
                    "pointer";

                    el.onclick=
                    async()=>{

                    menu.style.display=
                    "none";

                    await fn();

                     // hanya refresh UI, BUKAN reload dari backend
                      tabsController.tabs.render();
                      tabsController.tabs.syncForm();

                    };

                    menu.appendChild(
                    el
                    );

                    };

                    addItem(
                    "Rename",
                    ()=>tabsController
                    .renameTab(
                    tab
                    )
                    );

                    addItem(
                    "Duplicate",
                    ()=>tabsController
                    .duplicateTab(
                    tab
                    )
                    );

                    addItem(
                    tab.pinned
                    ?"Unpin"
                    :"Pin",

                    ()=>tabsController
                    .togglePinTab(
                    tab
                    )
                    );

                    addItem(
                    "Close",
                    ()=>tabsController
                    .closeTab(
                    tab.id
                    )
                    );

                    addItem(
                    "Delete",
                    ()=>tabsController
                    .deleteTab(
                    tab
                    )
                    );

                    menu.style.left=
                    `${e.clientX}px`;

                    menu.style.top=
                    `${e.clientY}px`;

                    menu.style.display=
                    "block";

                    };

                    document.addEventListener(
                    "click",
                    ()=>{

                    const menu=
                    document.getElementById(
                    "tabContextMenu"
                    );

                    if(menu){

                    menu.style.display=
                    "none";

                    }

                    }
      );

}




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

  initWorkspaceContextMenu();

  bindUI();

  initTabContextMenu();
  //startAutoSync();
}

// ================= USER =================
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

  const list =
    await WorkspaceService
      .getMyWorkspaces();

  State.workspaceList =
    list;

  let workspaceMeta;

  // ================= CREATE FIRST =================
  if (!list.length) {

    workspaceMeta =
      await WorkspaceService
        .createWorkspace(
          "My Workspace"
        );

  }
  else {

    workspaceMeta =
      list[0];

  }

  const workspaceId =
    extractId(
      workspaceMeta?.id
    );

  if (!workspaceId) {

    console.error(
      "[FATAL] workspace meta invalid:",
      workspaceMeta
    );

    return;

  }

  // ================= LOAD DETAIL =================
  const ws =
    await WorkspaceService
      .getWorkspace(
        workspaceId
      );

  State.workspaceId =
    workspaceId;

  State.workspace = {
    ...(ws || {}),

    id:
      workspaceId,

    name:
      workspaceMeta?.name
      || ws?.name
      || `Workspace ${workspaceId}`
  };

  // ================= UI =================
  renderActiveWorkspace({

    id:
      workspaceId,

    name:
      workspaceMeta?.name
      || ws?.name
      || `Workspace ${workspaceId}`

  });

  // hydrate app state
  hydrateState(
    ws?.data || {}
  );

  // ================= COLLECTION =================
  await loadCollections(
    workspaceId
  );

  const cols =
    State.collections
    || [];

  if (cols.length) {

    State.activeCollection =
      cols[0];

    await tabsController
      .loadCollection(
        cols[0].id
      );

  }
  else {

    tabs.tabs = [];

    tabs.activeId =
      null;

    tabs.render();

  }

  console.log(
    "[WORKSPACE LOADED]",
    workspaceId
  );

}
// ================= COLLECTION =================
async function loadCollections(workspaceId) {

   window.__collectionSync
 ?.start(
   workspaceId
 );
  const id = extractId(workspaceId);
  if (!id) return;

  try {

    // ================= FETCH COLLECTIONS =================
    const cols =
      (await CollectionService.getByWorkspace(Number(id)))
        .filter(c =>
          Number(c.workspace_id) === Number(id)
        );

    // ================= STATE UPDATE =================
    State.collections = cols;

    State.activeCollection =
      cols[0] || null;

    // ================= PASS TO CONTROLLER =================
    tabsController.setCollections(cols);

    // ================= RENDER COLLECTION LIST =================
    tabsController.renderCollections(
      document.getElementById("collectionList")
    );

    window.__collectionSync
 ?.start(
   workspaceId
 );

    // ================= LOAD ACTIVE COLLECTION =================
    if (State.activeCollection) {

      await tabsController.loadCollection(
        State.activeCollection.id
      );

    }

  } catch (err) {

    console.error(
      "[LOAD COLLECTIONS ERROR]",
      err
    );

  }

}
// ================= WORKSPACE SWITCH =================
async function loadWorkspaceSwitcher() {

  const select =
    document.getElementById(
      "workspaceSwitcher"
    );

  if (!select) return;

  // pakai cache dulu
  const list =
    State.workspaceList
    || await WorkspaceService
      .getMyWorkspaces();

  State.workspaceList = list;

  select.innerHTML = "";

  list.forEach(ws => {

    const id =
      extractId(ws.id);

    if (!id) return;

    const opt =
      document.createElement(
        "option"
      );

    opt.value = id;

    opt.textContent =
      ws.name
      || ws.title
      || `Workspace ${id}`;

    if (
      Number(id)
      === Number(
        State.workspaceId
      )
    ) {
      opt.selected = true;
    }

    select.appendChild(opt);

  });

  select.onchange =
    async (e) => {

    const id =
      extractId(
        e.target.value
      );

    if (!id) return;

    try {

      // metadata workspace
      const meta =
        State.workspaceList
          ?.find(
            w =>
              Number(w.id)
              === Number(id)
          );

      // detail workspace
      const ws =
        await WorkspaceService
          .getWorkspace(id);

      State.workspaceId =
        id;

      State.workspace = {
        ...(ws || {}),
        id,
        name:
          meta?.name
          || ws?.name
          || `Workspace ${id}`
      };

      renderActiveWorkspace({
        id,
        name:
          meta?.name
          || ws?.name
          || `Workspace ${id}`
      });

      hydrateState(
        ws?.data || {}
      );

      // reload collection
      await loadCollections(
        id
      );

      // auto buka collection pertama
      if (
        State.activeCollection
      ) {

        await tabsController
          .loadCollection(
            State.activeCollection
              .id
          );

      }
      else {

        tabs.tabs = [];
        tabs.activeId =
          null;

        tabs.render();

      }

      console.log(
        "[WORKSPACE SWITCHED]",
        id
      );

    }
    catch (err) {

      console.error(
        "[SWITCH FAILED]",
        err
      );

    }

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

    if (Array.isArray(data.tabs)) {
      tabs.tabs = structuredClone(
        data.tabs.filter(t => !t._closed)
      );
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
  ?.addEventListener(
    "click",
    async () => {

      await tabsController
        .addTabToActiveCollection();

      scheduleSave();

    }
  );

  ui.send?.addEventListener("click", sendRequest);

  // ================= LIVE TAB SYNC =================

    ui.method?.addEventListener(
      "change",
      onTabChanged
    );

    ui.url?.addEventListener(
      "input",
      onTabChanged
    );

    ui.body?.addEventListener(
      "input",
      onTabChanged
    );

  // ================= COLLECTION =================
  document.getElementById("newCollection")
    ?.addEventListener("click", async () => {

      const name = prompt("Collection name?");
      if (!name) return;

      const id = extractId(State.workspaceId);

      if (!id) {
        alert("Workspace belum valid");
        return;
      }

      try {
        await CollectionService.create(Number(State.workspaceId), name);

        await refreshWorkspaceState();

tabsController
 .renderCollections(
   ui.collectionList
 );

scheduleSave();

      } catch (err) {
        console.error("[CREATE COLLECTION FAILED]", err);
        alert("Gagal membuat collection");
      }
    });

  // ================= REQUEST =================
  document.getElementById(
  "addRequest"
)
?.addEventListener(

  "click",

  async ()=>{

    await tabsController
      .addTabToActiveCollection();

    await refreshWorkspaceState();

    scheduleSave();

  }

);

  // ================= WORKSPACE CREATE =================
  document.getElementById("createWorkspaceBtn")
    ?.addEventListener("click", async () => {

      const name = prompt("Workspace name?");
      if (!name) return;

      try {
        const ws = await WorkspaceService.createWorkspace(name);

        console.log("[WORKSPACE CREATED]", ws);

        const id = extractId(ws?.id);

        if (!id) {
          console.error("[CREATE WORKSPACE ERROR] invalid id", ws);
          return;
        }

        State.workspaceId = id;
        State.workspace = ws;

        renderActiveWorkspace({
  name: ws?.name ?? ws?.title ?? ws?.data?.name,
  id: ws?.id
}); // 🔥 FIX UI NAME

        hydrateState(ws.data || {});

        await loadWorkspaceFlow();

        await loadWorkspaceSwitcher();

        await refreshWorkspaceState();

        tabsController
        .renderCollections(
          ui.collectionList
        );

        console.log("[WORKSPACE SWITCHED TO NEW]", ws);

      } catch (err) {
        console.error("[CREATE WORKSPACE FAILED]", err);
        alert("Gagal membuat workspace");
      }
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

  if (
    State.applyingRemote
  ) return;

  if (
    !State.workspaceId
  ) return;

  // sync HANYA tab aktif
  const activeTab =
    tabs.getActive?.();

  if (
    activeTab
  ) {

    tabs.syncTab();

  }

  // SAVE REQUEST DB
  tabsController
    ?.saveActiveCollection?.();

  // BUILD WORKSPACE PAYLOAD
  const payload =
    buildState();

  // DEEP COPY biar ga ketimpa reference
  const safePayload =
    structuredClone(
      payload
    );

  WorkspaceService
    .updateWorkspace(

      State.workspaceId,

      {
        data:
          safePayload
      }

    )
    .catch(
      err => {

        console.error(
          "[WORKSPACE SAVE]",
          err
        );

      }
    );

}

// ================= BUILD =================
function buildState() {
  return {
    tabs: tabs.tabs.filter(t => !t._closed),
    activeId: tabs.activeId,
    collections: State.collections,
    environment: Environment.getAll()
  };
}




// ================= TAB CHANGE =================

function onTabChanged() {

  tabs.syncTab();

  scheduleSave();

}

// ================= HELPERS =================

async function refreshWorkspaceState() {

  if (!State.workspaceId)
    return;

  await loadCollections(
    State.workspaceId
  );

  if (
    State.activeCollection
  ) {

    await tabsController
      .loadCollection(
        State.activeCollection.id
      );

  }

}

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

window.refreshWorkspaceState = refreshWorkspaceState;