import { Tabs } from "ui/tabs.js";
import { RequestEngine } from "core/request-engine.js";
import { CollectionManager } from "core/collection.js";
import { Environment } from "core/environment.js";
import { ContextMenu } from "ui/context-menu.js";
import { Globals } from "core/globals.js";
import { createVariables } from "core/variables.js";
import { createPM } from "core/pm-helpers.js";
import { SyncService } from "core/sync/sync-service.js";

// ================= UI =================
const ui = {
  method: document.getElementById("method"),
  url: document.getElementById("url"),
  body: document.getElementById("body"),
  send: document.getElementById("send"),
  response: document.getElementById("response"),
  statusBar: document.getElementById("statusBar"),
  viewToggle: document.getElementById("viewToggle"),

  collectionList: document.getElementById("collectionList"),
  newCollection: document.getElementById("newCollection"),

  tabsEl: document.getElementById("tabs"),
  newTab: document.getElementById("newTab"),

  headersBox: document.getElementById("headersBox"),
  addHeader: document.getElementById("addHeader"),

  authType: document.getElementById("authType"),
  authValue: document.getElementById("authValue"),

  envKey: document.getElementById("envKey"),
  envValue: document.getElementById("envValue"),
  addEnv: document.getElementById("addEnv"),

  preScript: document.getElementById("preScript"),
  postScript: document.getElementById("postScript"),

  exportBtn: document.getElementById("exportBtn"),
  importFile: document.getElementById("importFile")
};

// ================= STATE =================
const tabs = new Tabs(ui);
const collections = new CollectionManager();
const ctx = new ContextMenu();

const sync = new SyncService({
  onUpdate: (data) => {
    applyRemoteState(data);
  }
});

let viewMode = "tree";
let lastResponse = null;
let activeCollectionId = null;
let syncTimer = null;
let runtimeVariables = null;
let preEditor = null;
let postEditor = null;


function applyRemoteState(data) {
  if (!data) return;

  // tabs
  if (data.tabs) {
    tabs.tabs = data.tabs;
    tabs.save();
    tabs.render();
    tabs.syncForm();
  }

  // collections
  if (data.collections) {
    collections.importWorkspace(JSON.stringify({
      collections: data.collections
    }));
    renderCollections();
  }

  // env
  if (data.environment) {
    Object.entries(data.environment).forEach(([k, v]) => {
      Environment.set(k, v);
    });
    renderEnvViewer();
  }
}


// ================= INIT =================
tabs.render();
tabs.syncForm();

initMonaco();

// tunggu monaco ready baru sync


renderCollections();
renderHeaders();
renderParams();
renderEnvViewer();

// ================= TREE =================
function renderTree(data) {
  const wrap = document.createElement("div");

  const createNode = (key, value) => {
    const div = document.createElement("div");

    const isObj = value && typeof value === "object";

    if (isObj) {
      const head = document.createElement("div");
      const child = document.createElement("div");

      let open = false;
      child.style.display = "none";

      head.style.cursor = "pointer";
      head.textContent = "▶ " + key;

      head.onclick = (e) => {
        e.stopPropagation();
        open = !open;
        child.style.display = open ? "block" : "none";
        head.textContent = (open ? "▼ " : "▶ ") + key;
      };

      Object.entries(value).forEach(([k, v]) => {
        child.appendChild(createNode(k, v));
      });

      div.appendChild(head);
      div.appendChild(child);
    } else {
      div.textContent = `${key}: ${value}`;
    }

    return div;
  };

  Object.entries(data || {}).forEach(([k, v]) => {
    wrap.appendChild(createNode(k, v));
  });

  return wrap;
}

// ================= STATUS =================
function renderStatus(res, time) {
  if (!ui.statusBar) return;

  if (res.error) {
    ui.statusBar.innerHTML = `<span style="color:red">ERROR</span> ${res.message}`;
    return;
  }

  ui.statusBar.innerHTML = `
    <span style="color:${res.status >= 400 ? "red" : "lime"}">
      ${res.status}
    </span>
    <span>${time}ms</span>
  `;
}

// ================= COPY =================
function addCopy(data) {
  const btn = document.createElement("button");
  btn.textContent = "Copy JSON";

  btn.onclick = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    btn.textContent = "Copied";
    setTimeout(() => (btn.textContent = "Copy JSON"), 1000);
  };

  return btn;
}

// ================= RESPONSE =================
function renderResponse(res, time) {
  ui.response.innerHTML = "";

  if (res.error) {
    ui.response.textContent = res.message;
    return;
  }

  lastResponse = { data: res.data, time };

  const meta = document.createElement("div");
  meta.style.fontSize = "12px";
  meta.style.color = "#aaa";
  meta.textContent = `${time} ms`;

  ui.response.appendChild(meta);

  if (viewMode === "tree") {
    ui.response.appendChild(renderTree(res.data));
  } else {
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(res.data, null, 2);
    ui.response.appendChild(pre);
  }

  ui.response.appendChild(addCopy(res.data));
}

// ================= COLLECTION =================
function renderCollections() {
  ui.collectionList.innerHTML = "";

  collections.getCollections().forEach(col => {
    const div = document.createElement("div");
    div.className = "collection";
    div.textContent = col.name;

    div.onclick = () => {
      activeCollectionId = col.id;
    };

    div.oncontextmenu = (e) => {
      e.preventDefault();

      ctx.show(e.clientX, e.clientY, [
        {
          label: "Rename",
          action: () => {
            const name = prompt("Collection name:");
            if (name) {
              collections.renameCollection(col.id, name);
              renderCollections();
            }
          }
        },
        {
          label: "Delete",
          action: () => {
            collections.deleteCollection(col.id);
            renderCollections();
          }
        }
      ]);
    };

    ui.collectionList.appendChild(div);
  });
}

ui.newCollection.onclick = () => {
  collections.createCollection("Collection " + Date.now());
  renderCollections();
};

// ================= HEADERS =================
function renderHeaders() {
  const box = ui.headersBox;
  const headers = getHeaders();

  box.innerHTML = "";

  // header row
  const header = document.createElement("div");
  header.className = "param-row header";
  header.innerHTML = `
    <span></span>
    <span>Key</span>
    <span>Value</span>
    <span></span>
  `;
  box.appendChild(header);

  Object.entries(headers).forEach(([key, item]) => {

    const row = document.createElement("div");
    row.className = "param-row";

    row.innerHTML = `
      <input type="checkbox" class="en" ${item.enabled ? "checked" : ""}>
      <input class="k" value="${key}">
      <input class="v" value="${item.value}">
      <button>x</button>
    `;

    // ❌ delete
    row.querySelector("button").onclick = () => {
      delete headers[key];
      tabs.save();
      renderHeaders();
    };

    // ✅ toggle
    row.querySelector(".en").onchange = (e) => {
      item.enabled = e.target.checked;
      tabs.save();
    };

    // ✅ rename key
    row.querySelector(".k").onblur = (e) => {
      const newKey = e.target.value.trim();
      const val = headers[key];

      if (!newKey || newKey === key) return;

      delete headers[key];
      headers[newKey] = val;

      tabs.save();
      renderHeaders();
    };

    // ✅ value update
    row.querySelector(".v").oninput = (e) => {
      item.value = e.target.value;
      tabs.save();
    };

    box.appendChild(row);
  });
}

// ================= AUTH =================
function buildAuthHeaders() {
  const tab = tabs.getActive();
  if (!tab?.auth) return {};

  const { type, value } = tab.auth;

  const finalValue = resolveVars(value); // 🔥 penting

  if (type === "bearer") {
    return { Authorization: `Bearer ${finalValue}` };
  }

  if (type === "apiKey") {
    return { "x-api-key": finalValue };
  }

  return {};
}

// ================= ENV =================
ui.addEnv?.addEventListener("click", () => {
  const k = ui.envKey?.value;
  const v = ui.envValue?.value;

    if (k) {
        Environment.set(k, v);
        renderEnvViewer(); // 🔥 penting
    }
});

// ================= VIEW TOGGLE =================
ui.viewToggle?.addEventListener("click", (e) => {
  const t = e.target;
  if (!t.dataset.mode) return;

  viewMode = t.dataset.mode;

  document.querySelectorAll(".opt").forEach(o => o.classList.remove("active"));
  t.classList.add("active");

  if (lastResponse) {
    renderResponse(lastResponse, lastResponse.time);
  }
});

// ================= SEND =================
ui.send.onclick = async () => {
  try {
    const tab = tabs.getActive();
    if (!tab) return;

    // ================= SYNC FIRST (WAJIB DI ATAS) =================
    syncScriptToTab();
    tabs.syncTab();
    tabs.save();

    const runtimeVariables = createVariables();

    // ================= PREPARE CONTEXT =================
    const preCtx = createContext(tab, null, runtimeVariables);
    runScript(tab.scripts?.pre, preCtx);

    ui.send.disabled = true;
    ui.send.textContent = "Sending...";

    // ================= RESOLVE VARS =================
    const tabParams = getParams();

    const rawUrl = buildUrlWithParams(
      ui.url.value.split("?")[0],
      Object.fromEntries(
        Object.entries(tabParams)
          .filter(([_, v]) => v.enabled && v.value)
          .map(([k, v]) => [k, resolveVars(v.value)])
      )
    );

    const finalUrl = resolveVars(rawUrl);

    let body = null;

    try {
      const rawBody = resolveVars(tab.body);
      body = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      ui.response.textContent = "Invalid JSON";
      return;
    }

    const start = performance.now();

    const res = await RequestEngine.send({
      method: ui.method.value,
      url: finalUrl,
      body,
      headers: {
        ...buildFinalHeaders(),
        ...buildAuthHeaders()
      }
    });

    const time = Math.round(performance.now() - start);

    renderStatus(res, time);
    renderResponse(res, time);

    // ================= POST SCRIPT =================
    const postCtx = createContext(tab, res, runtimeVariables);
    runScript(tab.scripts?.post, postCtx);

  } catch (err) {
    console.error(err);
    ui.response.textContent = err.message;
  } finally {
    ui.send.disabled = false;
    ui.send.textContent = "Send Request";
  }
};

// ================= TAB CONTEXT MENU FIX =================
ui.tabsEl?.addEventListener("contextmenu", (e) => {
  const tabEl = e.target.closest(".tab");
  if (!tabEl) return;

  e.preventDefault();

  const id = Number(tabEl.dataset.id);
  const tab = tabs.tabs.find(t => t.id === id);
  if (!tab) return;

  ctx.show(e.clientX, e.clientY, [
    {
      label: "Rename",
        action: () => {
            const name = prompt("Rename tab:");
            if (name) {
                tabs.rename(tab, name);
                tabs.render();
            }
        }
    },
    {
      label: "Duplicate",
      action: () => tabs.duplicate(tab)
    },
    {
      label: tab.pinned ? "Unpin" : "Pin",
      action: () => tabs.togglePin(tab)
    },
    {
      label: "Close",
      action: () => tabs.close(tab.id)
    }
  ]);
});

ui.newTab?.addEventListener("click", () => {
  tabs.create();
});

ui.method?.addEventListener("change", scheduleSync);
ui.url?.addEventListener("input", scheduleSync);
ui.body?.addEventListener("input", scheduleSync);

ui.preScript = document.getElementById("preScript");
ui.postScript = document.getElementById("postScript");



function scheduleSync() {
  clearTimeout(syncTimer);

  syncTimer = setTimeout(() => {
    tabs.syncTab();
  }, 300);
}



document.addEventListener("keydown", (e) => {

  // Ctrl + T → new tab
  if (e.ctrlKey && e.key === "t") {
    e.preventDefault();
    tabs.create();
  }

  // Ctrl + W → close tab
  if (e.ctrlKey && e.key === "w") {
    e.preventDefault();
    const active = tabs.getActive();
    if (active) tabs.close(active.id);
  }

  // Ctrl + L → focus URL
  if (e.ctrlKey && e.key === "l") {
    e.preventDefault();
    ui.url?.focus();
  }

  // Ctrl + Enter → send request
  if (e.ctrlKey && e.key === "Enter") {
    ui.send?.click();
  }

});


// ================= EXPORT =================
function exportWorkspace() {
  try {
    syncScriptToTab();
    tabs.syncTab(); // 🔥 ini penting banget
    const data = {
      tabs: tabs.tabs,
      collections: collections.getCollections(),
      environment: Environment.getAll()
    };

    const blob = new Blob(
      [JSON.stringify(data, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "postdim-workspace.json";
    a.click();

    URL.revokeObjectURL(url);

    console.log("[Export] success");
  } catch (err) {
    console.error("[Export ERROR]", err);
  }
}

// ================= IMPORT =================
function importWorkspace(file) {
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);

      // restore tabs
      if (data.tabs) {
            if (Array.isArray(data.tabs)) {
                tabs.tabs = data.tabs.map(tab => ({
                    id: tab.id || Date.now(),
                    name: tab.name || "Untitled",
                    method: tab.method || "GET",
                    url: tab.url || "",
                    body: tab.body || "",
                    history: Array.isArray(tab.history) ? tab.history : [],
                    pinned: tab.pinned || false,

                    headers: tab.headers || {},
                    params: tab.params || {},

                   scripts: {
                        pre: tab.scripts?.pre ?? "",
                        post: tab.scripts?.post ?? ""
                    }
                }));
        }
       const firstId = tabs.tabs[0]?.id;
       tabs.activeId = tabs.tabs.find(t => t.id === data.activeId)?.id || firstId;
        tabs.save();
        tabs.render();
        tabs.syncForm();
      }

      // restore collections
      if (data.collections) {
        collections.importWorkspace(JSON.stringify({
            collections: data.collections
        }));
        renderCollections();
      }

      // restore env
      if (data.environment) {
        Environment.clear?.(); // kalau kamu punya
        Object.entries(data.environment).forEach(([k, v]) => {
          Environment.set(k, v);
        });
      }

      console.log("[Import] success");

    } catch (err) {
      console.error("[Import ERROR]", err);
    }
  };

  reader.readAsText(file);
}

// ================= BIND BUTTON =================
ui.exportBtn?.addEventListener("click", exportWorkspace);

ui.importFile?.addEventListener("change", (e) => {
  importWorkspace(e.target.files[0]);
});



function buildUrlWithParams(url, params) {
  const query = new URLSearchParams(params).toString();
  return query ? `${url}?${query}` : url;
}


// ================= REQUEST TABS =================
document.querySelectorAll(".req-tab").forEach(tab => {
  tab.addEventListener("click", () => {

    // active tab
    document.querySelectorAll(".req-tab")
      .forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

    const target = tab.dataset.tab;

    // switch panel
    document.querySelectorAll(".tab-panel")
      .forEach(p => p.classList.add("hidden"));

    document.querySelector(`[data-panel="${target}"]`)
      ?.classList.remove("hidden");
  });
});

function renderParams() {
  const box = document.getElementById("paramsBox");
  const params = getParams();

  box.innerHTML = "";

  // header
  const header = document.createElement("div");
  header.className = "param-row header";
  header.innerHTML = `
    <span></span>
    <span>Key</span>
    <span>Value</span>
    <span>Description</span>
    <span></span>
  `;
  box.appendChild(header);

  Object.entries(params).forEach(([key, item]) => {

    const row = document.createElement("div");
    row.className = "param-row";

    row.innerHTML = `
      <input type="checkbox" class="en" ${item.enabled ? "checked" : ""}>
      <input class="k" value="${key}">
      <input class="v" value="${item.value}">
      <input class="d" placeholder="description" value="${item.desc || ""}">
      <button>x</button>
    `;

    row.querySelector("button").onclick = () => {
      delete params[key];
      tabs.save();
      renderParams();
      updateURLWithParams();
    };

    row.querySelector(".en").onchange = (e) => {
      item.enabled = e.target.checked;
      tabs.save();
      updateURLWithParams();
    };

    row.querySelector(".k").onblur = (e) => {
        const newKey = e.target.value.trim();
        const val = params[key];

        if (!newKey || newKey === key) return;

        delete params[key];
        params[newKey] = val;

        tabs.save();
        renderParams();
        updateURLWithParams();
    };

    row.querySelector(".k").oninput = (e) => {
    const newKey = e.target.value;

    item._tempKey = newKey; // simpan sementara
    };

    row.querySelector(".v").oninput = (e) => {
      item.value = e.target.value;
      tabs.save();
      updateURLWithParams();
    };

    row.querySelector(".d").oninput = (e) => {
      item.desc = e.target.value;
      tabs.save();
    };

    box.appendChild(row);
  });
}

ui.addHeader?.addEventListener("click", () => {
  const headers = getHeaders();

  headers[`header_${Date.now()}`] = {
    value: "",
    enabled: true
  };

  tabs.save();
  renderHeaders();
});

document.getElementById("addParam")?.addEventListener("click", () => {
  const params = getParams();

  params[`param_${Date.now()}`] = {
    value: "",
    desc: "",
    enabled: true
  };

  tabs.save();
  renderParams();
});

ui.authType?.addEventListener("change", () => {
  tabs.syncTab();
});

ui.authValue?.addEventListener("input", () => {
  tabs.syncTab();
});

function updateURLWithParams() {
  const urlInput = document.getElementById("url");
  const params = getParams();

  if (!urlInput) return;

  try {
    const raw = urlInput.value.split("?")[0]; // 🔥 penting: buang query lama
    if (!raw) return;

    const url = new URL(raw);

    Object.entries(params).forEach(([k, item]) => {
      if (!item.enabled) return;
      if (!k) return;
      if (!item.value) return;

      url.searchParams.set(k, item.value);
    });

    urlInput.value = url.toString();

    const tab = tabs.getActive();
    if (tab) {
      tab.url = urlInput.value;
      tabs.save(); // 🔥 WAJIB biar persist
    }

  } catch {}
}

function getParams() {
  const tab = tabs.getActive();
  if (!tab) return {};

  if (!tab.params) tab.params = {};
  return tab.params;
}

const originalSetActive = tabs.setActive.bind(tabs);

tabs.setActive = (id) => {
  originalSetActive(id);

  const params = getParams();

  renderParams();
  renderHeaders();
  syncScriptToTab(); 
  renderScripts();
};

function buildFinalHeaders() {
  const raw = getHeaders();
  const result = {};

  Object.entries(raw).forEach(([k, item]) => {
    if (!item.enabled) return;
    if (!k) return;
    if (!item.value) return;

    result[k] = resolveVars(item.value); // 🔥
  });

  return result;
}

function getHeaders() {
  const tab = tabs.getActive();
  if (!tab) return {};

  if (!tab.headers) tab.headers = {};
  return tab.headers;
}


function runScript(code, context) {
  if (!code || !code.trim()) return;

  try {
    const fn = new Function("pm", `"use strict";\n${code}`);
    fn(context.pm);
  } catch (err) {
    console.error("Script error:", err);

    // 🔥 tambahan debug penting
    console.log("SCRIPT SOURCE:\n", code);
  }
}

function createContext(tab, res = null, runtimeVars) {

  return {
    pm: createPM({
      env: Environment,
      globals: Globals,

      collectionVars: tab?.collectionVars,
      runtimeVars: runtimeVars,

      request: {
        method: tab?.method,
        url: tab?.url,
        headers: buildFinalHeaders?.() || {}, // 🔥 penting: resolved headers
        body: tab?.body
      },

      response: res
    })
  };
}

function getByPath(obj, path) {
  return path
    .split(".")
    .reduce((acc, key) => acc?.[key], obj);
}

function renderEnvViewer() {
  const box = document.getElementById("envList");
  const env = Environment.getAll();

  box.innerHTML = "";

  Object.entries(env).forEach(([key, value]) => {

    const row = document.createElement("div");

    row.innerHTML = `
      <input class="k" value="${key}">
      <input class="v" value="${value}">
      <button class="del">delete</button>
    `;

    // update value
    row.querySelector(".v").oninput = (e) => {
      Environment.set(key, e.target.value);
    };

    // rename key
    row.querySelector(".k").onblur = (e) => {
      const newKey = e.target.value.trim();
      if (!newKey || newKey === key) return;

      const val = Environment.get(key);

      Environment.set(newKey, val);
      Environment.remove(key); // 🔥 FIX IMPORTANT

      renderEnvViewer();
    };

    // delete
    row.querySelector(".del").onclick = () => {
      Environment.remove(key);
      renderEnvViewer();
    };

    box.appendChild(row);
  });
}

function resolveVars(str) {
  if (!str) return str;

  return str.replace(/{{(.*?)}}/g, (_, key) => {
    key = key.trim();

    const sources = [
        Environment.get.bind(Environment),
        Globals.get.bind(Globals),
        (k) => runtimeVariables?.get?.(k)
    ];

    for (const get of sources) {
        const val = get?.(key);
        if (val !== undefined && val !== null) return val;
    }
    return "";
  });
}

function renderScripts() {
  const tab = tabs.getActive();
  if (!tab) return;

  if (!tab.scripts) {
    tab.scripts = { pre: "", post: "" };
  }

  if (preEditor && postEditor) {
    preEditor.setValue(tab.scripts.pre || "");
    postEditor.setValue(tab.scripts.post || "");
  }
}

preEditor?.onDidChangeModelContent(() => {
  const tab = tabs.getActive();
  if (!tab) return;

  tab.scripts.pre = preEditor.getValue();
  tabs.save();
});

postEditor?.onDidChangeModelContent(() => {
  const tab = tabs.getActive();
  if (!tab) return;

  tab.scripts.post = postEditor.getValue();
  tabs.save();
});


const envPanel = document.getElementById("envPanel");

document.getElementById("openEnvModal")?.addEventListener("click", () => {
  envPanel.classList.add("show");
  renderEnvViewer();
});

document.getElementById("closeEnvPanel")?.addEventListener("click", () => {
  envPanel.classList.remove("show");
});


function initMonaco() {
  require.config({ paths: { vs: "node_modules/monaco-editor/min/vs" } });

  require(["vs/editor/editor.main"], function () {

        preEditor = monaco.editor.create(document.getElementById("preEditor"), {
            value: "",
            language: "javascript",
            theme: "vs-dark",
            automaticLayout: true,
            minimap: { enabled: false }
        });

        postEditor = monaco.editor.create(document.getElementById("postEditor"), {
            value: "",
            language: "javascript",
            theme: "vs-dark",
            automaticLayout: true,
            minimap: { enabled: false }
        });

        setupPMIntellisense();
        bindMonacoAutoSave(); // 🔥 TAMBAH INI

        // ✅ INI PENTING (FIX UTAMA)
        const tab = tabs.getActive();
        if (tab?.scripts) {
            preEditor.setValue(tab.scripts.pre || "");
            postEditor.setValue(tab.scripts.post || "");
        }
    });
}
window.__syncMonacoFromTab = () => {
  const tab = tabs.getActive();
  if (!tab) return;

  if (preEditor) preEditor.setValue(tab.scripts?.pre || "");
  if (postEditor) postEditor.setValue(tab.scripts?.post || "");
};


function setupPMIntellisense() {
  monaco.languages.registerCompletionItemProvider("javascript", {
    provideCompletionItems: () => {

      const envKeys = Object.keys(Environment.getAll?.() || {});
      const globalsKeys = Object.keys(Globals.getAll?.() || {});

      const envSuggestions = envKeys.map(k => ({
        label: `env.${k}`,
        kind: monaco.languages.CompletionItemKind.Variable,
        insertText: `pm.environment.get("${k}")`
      }));

      const globalSuggestions = globalsKeys.map(k => ({
        label: `global.${k}`,
        kind: monaco.languages.CompletionItemKind.Variable,
        insertText: `pm.globals.get("${k}")`
      }));

      return {
        suggestions: [
          {
            label: "pm.environment.get",
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: "pm.environment.get('${1:key}')",
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
          },
          {
            label: "pm.environment.set",
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: "pm.environment.set('${1:key}', ${2:value})",
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
          },
          {
            label: "pm.response.json",
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: "pm.response.json()"
          },
          ...envSuggestions,
          ...globalSuggestions
        ]
      };
    }
  });
}

function syncScriptToTab() {
  const tab = tabs.getActive();
  if (!tab) return;

  tab.scripts ||= { pre: "", post: "" };

  if (preEditor) tab.scripts.pre = preEditor.getValue() || "";
  if (postEditor) tab.scripts.post = postEditor.getValue() || "";

  tabs.save();
}

function bindMonacoAutoSave() {

  preEditor?.onDidChangeModelContent(() => {
    const tab = tabs.getActive();
    if (!tab) return;

    tab.scripts ||= { pre: "", post: "" };
    tab.scripts.pre = preEditor.getValue();

    tabs.save();
  });

  postEditor?.onDidChangeModelContent(() => {
    const tab = tabs.getActive();
    if (!tab) return;

    tab.scripts ||= { pre: "", post: "" };
    tab.scripts.post = postEditor.getValue();

    tabs.save();
  });
}

function pushSync() {
  sync.send({
    tabs: tabs.tabs,
    activeId: tabs.activeId,
    collections: collections.getCollections(),
    environment: Environment.getAll()
  });
}