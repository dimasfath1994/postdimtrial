import { Tabs } from "./ui/tabs.js";
import { RequestEngine } from "./core/request-engine.js";
import { CollectionManager } from "./core/collection.js";
import { Environment } from "./core/environment.js";
import { ContextMenu } from "./ui/context-menu.js";
import { Globals } from "./core/globals.js";
import { createVariables } from "./core/variables.js";
import { createPM } from "./core/pm-helpers.js";
import { SyncService } from "./core/sync/sync-service.js";
import { exportPostmanCollection } from "./core/exporters/postman-exporter.js";
import { importPostmanCollection } from "./core/importers/postman-importer.js";

import { GraphqlHandler } from './ui/graphql-handler.js';
import { GrpcHandler } from './ui/grpc-handler.js';

const isTauri = window.__TAURI_INTERNALS__ !== undefined;

if (isTauri) {
    // Sembunyikan tombol jika user sudah pakai versi desktop
    document.getElementById('downloadAppBtn').style.display = 'none';
} else {
    // Jika di browser, arahkan ke GitHub Releases
    document.getElementById('downloadAppBtn').addEventListener('click', () => {
        window.open('https://github.com/dimasfath1994/postdimtrial/releases/latest/download/app.exe', '_blank');
    });
}


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

  addRequest: document.getElementById("addRequest"),

  headersBox: document.getElementById("headersBox"),
  addHeader: document.getElementById("addHeader"),

  authType: document.getElementById("authType"),
  authValue: document.getElementById("authValue"),

  envKey: document.getElementById("envKey"),
  envValue: document.getElementById("envValue"),
  addEnv: document.getElementById("addEnv"),

  preScript: document.getElementById("preScript"),
  postScript: document.getElementById("postScript"),


  bodyType: document.getElementById("bodyType"),
  exportBtn: document.getElementById("exportBtn"),
  useProxy: document.getElementById("use-proxy"),
  importFile: document.getElementById("importFile"),


  graphqlQuery: document.getElementById("graphqlQuery"),
  graphqlVariables: document.getElementById("graphqlVariables"),
  grpcServiceMethod: document.getElementById("grpcServiceMethod"),
  grpcBody: document.getElementById("grpcBody"),
  protoFileName: document.getElementById("protoFileName")
};
const bodyMode = document.getElementById("bodyMode");

// ================= STATE =================
const APP_STATE = {
  collabMode: false
};

const collections = new CollectionManager();
const tabs = new Tabs(ui, collections);


// Menyimpan state sementara (loading & response) tiap tab di memori RAM
const tabRuntimeStates = {}; 

// Intercept fungsi close dan delete bawaan agar otomatis menghapus response dari RAM
const originalClose = tabs.close.bind(tabs);
tabs.close = (id) => {
  delete tabRuntimeStates[id]; // Hapus dari memori RAM saat tab di-close
  originalClose(id);
};

const originalDelete = tabs.delete.bind(tabs);
tabs.delete = (id) => {
  delete tabRuntimeStates[id]; // Hapus dari memori RAM saat tab dihapus total
  originalDelete(id);
};



tabs.onUpdate = () => {
    renderCollections(); 
};

const ctx = new ContextMenu();

const sync = new SyncService({
  onUpdate: (data) => {
    applyRemoteState(data);
  }
});

let viewMode = "raw";
let lastResponse = null;
let activeCollectionId = null;
let expandedCollections = {};
let syncTimer = null;
let runtimeVariables = null;
let preEditor = null;
let postEditor = null;


window.eventBus = {
  emit: (event, data) => window.dispatchEvent(new CustomEvent(event, { detail: data })),
  on: (event, callback) => window.addEventListener(event, (e) => callback(e.detail))
};

// Pasang listener di sini
window.eventBus.on('data-changed', () => {
  if (typeof renderCollections === 'function') renderCollections();
});


document.getElementById("collabModeBtn").onclick = () => {
  APP_STATE.collabMode = true;

  // sementara: arahkan ke login page
  window.location.href = "login.html";
};

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


const isProxyEnabled = localStorage.getItem('proxy_enabled') === 'true';
ui.useProxy.checked = isProxyEnabled;

ui.useProxy.addEventListener('change', (e) => {
    localStorage.setItem('proxy_enabled', e.target.checked);
});


// ================= INIT =================
tabs.render();
tabs.syncForm();

initMonaco();

GraphqlHandler.setupUI(ui, tabs, scheduleSync);
GrpcHandler.setupUI(ui, tabs, scheduleSync);
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
  const bodyBox =
  document.getElementById(
    "responseBody"
  );

const headerBox =
  document.getElementById(
    "responseHeaders"
  );

const cookieBox =
  document.getElementById(
    "responseCookies"
  );

bodyBox.innerHTML = "";
headerBox.innerHTML = "";
cookieBox.innerHTML = "";

  if (res.error) {
    ui.response.textContent = res.message;
    return;
  }

  lastResponse = { data: res.data, time };

  const meta = document.createElement("div");
  meta.style.fontSize = "12px";
  meta.style.color = "#aaa";
  meta.textContent = `${time} ms`;

  bodyBox.appendChild(meta);

  if (viewMode === "tree") {
    bodyBox.appendChild(renderTree(res.data));
  } else {
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(res.data, null, 2);
    bodyBox.appendChild(pre);
  }

  bodyBox.appendChild(addCopy(res.data));


  // ================= RESPONSE HEADERS =================
if (res.headers) {

  const pre =
    document.createElement("pre");

  pre.textContent =
    JSON.stringify(
      res.headers,
      null,
      2
    );

  headerBox.appendChild(pre);
}

// ================= RESPONSE COOKIES =================
const cookies =
  res.headers?.["set-cookie"] ||
  res.headers?.["Set-Cookie"];

if (cookies) {

  const pre =
    document.createElement("pre");

  pre.textContent =
    Array.isArray(cookies)
      ? cookies.join("\n")
      : cookies;

  cookieBox.appendChild(pre);
}
}

// ================= COLLECTION =================
function renderCollections() {
  
  ui.collectionList.innerHTML = "";

  collections.getCollections().forEach(col => {

    const wrap = document.createElement("div");

    // ================= COLLECTION HEADER =================

    const div = document.createElement("div");
    div.className = "collection";

    const expanded = expandedCollections[col.id];

    div.innerHTML = `
      <span>${expanded ? "▼" : "▶"}</span>
      <span>${col.name}</span>
    `;

    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.gap = "6px";

    // ================= CLICK =================

   div.onclick = () => {

  const isSameCollection =
    activeCollectionId === col.id;

  // expand/collapse ONLY
  if (isSameCollection) {
    expandedCollections[col.id] =
      !expandedCollections[col.id];

    renderCollections();
    return;
  }

  // save current collection
  saveActiveCollectionState();

  // load clicked collection
  loadCollectionState(col.id);

  // auto expand collection yg dibuka
  expandedCollections[col.id] = true;

  renderCollections();
};


    // ================= CONTEXT MENU =================

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
        },
        {
          label: "Export Postman",
          action: () => {
            exportCollectionAsPostman(col.id);
          }
        },
        {
          label: "Add Request",
          action: () => {
            saveActiveCollectionState();

              tabs.create();

              saveActiveCollectionState();
          }
        },
        // Di dalam UI/Context Menu
       // ... di dalam oncontextmenu collection header
       // ... di dalam div.oncontextmenu (header collection)
{ 
  label: "Add Folder", 
  action: () => {
    const name = prompt("New folder name:");
    if (name) {
      // Gunakan col.id (karena ini header collection)
      // ParentId adalah null karena ini folder di root collection
      collections.addFolder(col.id, name, null); 
      
      // Expand collection-nya agar folder terlihat
      expandedCollections[col.id] = true;
      
      renderCollections();
    }
  }
}
          
      ]);
    };

    wrap.appendChild(div);



    // ... di dalam loop collections.forEach(col => { ...
// ... setelah bagian COLLECTION HEADER selesai ...

// ================= RENDER FOLDER & ROOT REQUEST =================
if (expanded) {
  const reqWrap = document.createElement("div");
  reqWrap.style.marginTop = "4px";

  // 1. Render Folder Root
  col.folders?.forEach(folder => {
      renderFolderTree(folder, reqWrap, col.id, 1);
  });

  // 2. Render Request yang ada di root Collection
  col.requests?.forEach(req => {
    // TAMBAHKAN KONDISI INI:
    // Hanya render jika folderId tidak ada (null/undefined)
    if (!req.folderId || req.folderId === "undefined" || req.folderId === "") {
        const reqDiv = document.createElement("div");
        reqDiv.className = "collection-request";
        reqDiv.style.marginLeft = "18px";
        reqDiv.textContent = `${req.method || "GET"} ${req.name}`;
        
        reqDiv.onclick = (e) => {
            e.stopPropagation();
            tabs.openRequest(req);
        };
        
        reqWrap.appendChild(reqDiv);
    }
});

  wrap.appendChild(reqWrap);
}


    // ================= REQUEST LIST =================

    if (expanded && col.tabs?.length) {

      const reqWrap = document.createElement("div");

      reqWrap.style.marginLeft = "18px";
      reqWrap.style.marginTop = "4px";

      col.tabs.forEach(tab => {
        if (tab.folderId) return;
        const req = document.createElement("div");

        req.className = "collection-request";
        console.log("TAB METHOD", tab.method);
        req.textContent =
          `${tab.method || "GET"} ${tab.name}`;

        req.style.fontSize = "12px";
        req.style.padding = "4px 6px";
        req.style.opacity = ".8";
        req.style.cursor = "pointer";

        req.onclick = (e) => {

            e.stopPropagation();

            saveActiveCollectionState();

            loadCollectionState(col.id);

            // cari ulang tab sesudah load
            const openedTab =
              tabs.tabs.find(t => t.id === tab.id);

            if (openedTab) {
              openedTab.opened = true;
            }

            tabs.setActive(tab.id);

            tabs.render();

            renderCollections();
          };

          req.oncontextmenu = (e) => {

            e.preventDefault();
            e.stopPropagation();

            ctx.show(e.clientX, e.clientY, [
              {
                label: "Rename",
                action: () => {
                  //INI SIDEBAR
                  const name = prompt("Rename tab:");

                  if (name) {
                    const tabe = tabs.tabs.find(t => t.id === tab.id);
                    tabs.rename(tabe, name);

                    saveActiveCollectionState();
                    renderCollections();
                  }
                }
              },
              {
                label: "Duplicate",
                action: () => {

                  tabs.duplicate(tab);

                  saveActiveCollectionState();
                  renderCollections();
                }
              },
              {
                label: tab.pinned ? "Unpin" : "Pin",
                action: () => {

                  tabs.togglePin(tab);

                  saveActiveCollectionState();
                  renderCollections();
                }
              },
              {
                label: "Close",
                action: () => {

                  tabs.close(tab.id);

                  saveActiveCollectionState();
                  renderCollections();
                }
              },
              {
                label: "Delete",
                action: () => {

                  tabs.delete(tab.id);

                  saveActiveCollectionState();
                  renderCollections();
                }
              }
            ]);
          };

        reqWrap.appendChild(req);
      });

      wrap.appendChild(reqWrap);
    }

    ui.collectionList.appendChild(wrap);
  });
  
}




// Helper untuk merender folder dan request secara rekursif
function renderFolderTree(folder, container, colId, depth = 1) {
  const isExpanded = expandedCollections[folder.id];

  const folderDiv = document.createElement("div");
  folderDiv.className = "folder-item";
  folderDiv.style.marginLeft = `${depth * 15}px`;
  folderDiv.style.cursor = "pointer";
  folderDiv.innerHTML = `<span>${isExpanded ? "▼" : "▶"} ${folder.name}</span>`;

  folderDiv.onclick = (e) => {
    e.stopPropagation();
    expandedCollections[folder.id] = !expandedCollections[folder.id];
    renderCollections();
  };

  // Context Menu untuk Folder
  folderDiv.oncontextmenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    ctx.show(e.clientX, e.clientY, [
      { 
        label: "Add Folder", action: () => {
          const name = prompt("New folder name:");
          if (name) {
            collections.addFolder(colId, name, folder.id);
            renderCollections();
          }
      }
    },
    {
        label: "Rename",
        action: () => {
            const newName = prompt("Rename folder:", folder.name);
            if (newName) {
                collections.renameFolder(colId, folder.id, newName);
                renderCollections();
            }
        }
    },
    {
        label: "Delete",
        action: () => {
          collections.deleteFolder(colId, folder.id);
          // Bersihkan tab yang mungkin terbuka dari folder ini
          tabs.tabs = tabs.tabs.filter(t => t.folderId !== folder.id);
          tabs.save();
          renderCollections();
        }
    },
    { 
      label: "Add Request", 
      action: () => {
          // 1. Tambahkan ke data collections (BIAR MUNCUL DI SIDEBAR)
          // Fungsi ini harus mencari folder berdasarkan folder.id dan mem-push request baru ke array-nya
          
          // 2. Tambahkan ke tabs (BIAR MUNCUL DI HEADER/EDITOR)
          tabs.create(colId, folder.id);
          
          // 3. Expand folder agar user bisa langsung melihat request baru
          expandedCollections[folder.id] = true;
          
          // 4. Update UI agar sidebar dan tab ter-refresh
          renderCollections();
          tabs.render();
      }
    }
    ]);
  };

  container.appendChild(folderDiv);

  // Jika folder dibuka, render children-nya
  // Di dalam renderFolderTree (bagian setelah folder ter-expand)
  if (isExpanded) {
    // 1. RENDER SUB-FOLDERS (REKURSI DI SINI!)
    folder.folders?.forEach(subFolder => {
        // Panggil fungsi ini lagi untuk sub-folder
        renderFolderTree(subFolder, container, colId, depth + 1);
    });
    
    // 2. RENDER REQUESTS DI DALAM FOLDER
folder.requests?.forEach(req => {
  console.log("LOG BADGE", req);
  const reqDiv = document.createElement("div");
  reqDiv.className = "collection-request";
  reqDiv.style.marginLeft = `${(depth + 1) * 15}px`;
  reqDiv.textContent = `${req.method || "GET"} ${req.name}`;
  reqDiv.style.cursor = "pointer";

  // Klik untuk membuka tab
  reqDiv.onclick = (e) => {
      e.stopPropagation();
      tabs.openRequest(req);
  };

  // --- TAMBAHKAN CONTEXT MENU DI SINI ---
  reqDiv.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      ctx.show(e.clientX, e.clientY, [
          {
              label: "Rename",
              action: () => {
                  const name = prompt("Rename tab:");
                  if (name) {
                      //tabs.rename(req, name); // Pastikan fungsi rename ada di tabs/manager
                      tabs.renameById(req.id, name, colId, req.folderId);
                      saveActiveCollectionState();
                      renderCollections();
                  }
              }
          },
          {
              label: "Duplicate",
              action: () => {
                  tabs.duplicate(req);
                  saveActiveCollectionState();
                  renderCollections();
              }
          },
          {
              label: req.pinned ? "Unpin" : "Pin",
              action: () => {
                  tabs.togglePin(req);
                  renderCollections();
              }
          },
          {
              label: "Close",
              action: () => {
                  tabs.close(req.id);
                  renderCollections();
              }
          },
          {
              label: "Delete",
              action: () => {
                  collections.deleteRequest(colId, req.id);
                  tabs.close(req.id); // Tutup tab jika terbuka
                  saveActiveCollectionState();
                  renderCollections();
              }
          }
      ]);
  };

  container.appendChild(reqDiv);
});





  }
}


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

    // delete
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

    //  value update
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
        saveActiveCollectionEnv();
        renderEnvViewer(); // 🔥 penting
    }
});
function saveActiveCollectionEnv() {
  const active = collections
    .getCollections()
    .find(c => c.id === activeCollectionId);

  if (!active) return;

  active.environment = structuredClone(
    Environment.getAll()
  );
  collections.save?.();
}

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
// ui.send.onclick = async () => {
//   try {
//     const tab = tabs.getActive();
//     if (!tab) return;

//     // ================= SYNC FIRST (WAJIB DI ATAS) =================
//     syncScriptToTab();
//     tabs.syncTab();
//     tabs.save();

//     const runtimeVariables = createVariables();

//     // ================= PREPARE CONTEXT =================
//     const preCtx = createContext(tab, null, runtimeVariables);
//     runScript(tab.scripts?.pre, preCtx);

//     ui.send.disabled = true;
//     ui.send.textContent = "Sending...";

//     // ================= RESOLVE VARS =================
//     const tabParams = getParams();

//     const rawUrl = buildUrlWithParams(
//       ui.url.value.split("?")[0],
//       Object.fromEntries(
//         Object.entries(tabParams)
//           .filter(([_, v]) => v.enabled && v.value)
//           .map(([k, v]) => [k, resolveVars(v.value)])
//       )
//     );

//     const finalUrl = resolveVars(rawUrl);

//     let body = null;

//     const tabBody = tabs.getActive().body;

//     if (tabBody?.mode === "raw") {
//       body = tabBody.raw ? JSON.parse(tabBody.raw) : null;
//     }

// if (tabBody?.mode === "form-data") {
//   body = Object.fromEntries(
//     (tabBody.formData || [])
//       .filter(x => x.key != null && x.key !== "") //  TARUH DI SINI
//       .map(x => [
//         x.key,
//         {
//           value:
//             x.enabled === false
//               ? null
//               : x.value === undefined
//                 ? ""
//                 : x.value, //  empty string tetap terkirim
//           type: x.type || "text",
//           file: x.file || null,
//           enabled: x.enabled !== false
//         }
//       ])
//   );
// }
// if (tabBody?.mode === "urlencoded") {
//   body = Object.fromEntries(
//     (tabBody.urlencoded || [])
//       .filter(x => x.key != null && x.key !== "") //  TARUH DI SINI
//       .map(x => [
//         x.key,
//         {
//           value:
//             x.enabled === false
//               ? null
//               : x.value === undefined
//                 ? ""
//                 : x.value, // string kosong tetap ""
//           enabled: x.enabled !== false
//         }
//       ])
//   );
// }

//     // try {
//     //   const rawBody = resolveVars(tab.body);
//     //   body = rawBody ? JSON.parse(rawBody) : null;
//     // } catch {
//     //   ui.response.textContent = "Invalid JSON";
//     //   return;
//     // }

//     const start = performance.now();

// console.log("BODY MODE", tabBody?.mode);
// console.log("BODY RAW", tabBody?.raw);
// console.log("FINAL BODY", body);

//     const res = await RequestEngine.send({
//       method: ui.method.value,
//       url: finalUrl,
//       body,
//       headers: {
//         ...buildFinalHeaders(),
//         ...buildAuthHeaders()
//       },
//        bodyType: tab.body?.mode || "json"
//     });

//     const time = Math.round(performance.now() - start);

//     renderStatus(res, time);
//     renderResponse(res, time);

//     // ================= POST SCRIPT =================
//     const postCtx = createContext(tab, res, runtimeVariables);
//     runScript(tab.scripts?.post, postCtx);

//   } catch (err) {
//     console.error(err);
//     ui.response.textContent = err.message;
//   } finally {
//     ui.send.disabled = false;
//     ui.send.textContent = "Send Request";
//   }
// };

// ================= SEND =================
ui.send.onclick = async () => {
  // Ambil ID tab yang memicu request saat tombol diklik (Closure)
  let executingTabId = null;
  
  try {
    const tab = tabs.getActive();
    if (!tab) return;
    
    executingTabId = tab.id;

    // Inisialisasi runtime state untuk tab ini
    tabRuntimeStates[executingTabId] = { isSending: true, res: null, time: 0 };

    // ================= SYNC FIRST (WAJIB DI ATAS) =================
    GraphqlHandler.syncToState(tab, ui);
    GrpcHandler.syncToState(tab, ui);
    syncScriptToTab();
    tabs.syncTab();
    tabs.save();

    const runtimeVariables = createVariables();

    // ================= PREPARE CONTEXT =================
    const preCtx = createContext(tab, null, runtimeVariables);
    runScript(tab.scripts?.pre, preCtx);

    // Hanya ubah teks tombol jika user masih melihat tab yang mengeksekusi request
    if (tabs.activeId === executingTabId) {
      ui.send.disabled = true;
      ui.send.textContent = "Sending...";
    }

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
    const tabBody = tabs.getActive().body;

    if (tabBody?.mode === "raw") {
      body = tabBody.raw ? JSON.parse(tabBody.raw) : null;
    }



    if (tabBody?.mode === "graphql") {
      body = GraphqlHandler.prepareRequestBody(tab, resolveVars);
    } 
    if (tabBody?.mode === "grpc") {
      const GrpcHandler = {
          prepareRequestBody(tab, resolveVars) {
              // Ambil service_method dan payload dari input UI gRPC tab terkait
              return {
                  serviceMethod: resolveVars(tab.body.grpc.serviceMethod), // contoh: "auth.AuthService/Login"
                  payload: JSON.parse(resolveVars(tab.body.grpc.payload || "{}"))
              };
          },
          syncToState(tab, ui) {
              // sinkronisasi UI ke tab state jika diperlukan
          }
      };
      body = GrpcHandler.prepareRequestBody(tab, resolveVars);
    }

    if (tabBody?.mode === "form-data") {
      body = Object.fromEntries(
        (tabBody.formData || [])
          .filter(x => x.key != null && x.key !== "")
          .map(x => [
            x.key,
            {
              value: x.enabled === false ? null : x.value === undefined ? "" : x.value,
              type: x.type || "text",
              file: x.file || null,
              enabled: x.enabled !== false
            }
          ])
      );
    }
    if (tabBody?.mode === "urlencoded") {
      body = Object.fromEntries(
        (tabBody.urlencoded || [])
          .filter(x => x.key != null && x.key !== "")
          .map(x => [
            x.key,
            {
              value: x.enabled === false ? null : x.value === undefined ? "" : x.value,
              enabled: x.enabled !== false
            }
          ])
      );
    }

    const start = performance.now();

    console.log("BODY MODE", tabBody?.mode);
    console.log("BODY RAW", tabBody?.raw);
    console.log("FINAL BODY", body);

    const res = await RequestEngine.send({
      method: ui.method.value,
      url: finalUrl,
      body,
      headers: {
        ...buildFinalHeaders(),
        ...buildAuthHeaders()
      },
       bodyType: tab.body?.mode || "json"
    });

    const time = Math.round(performance.now() - start);

    // Simpan hasil response ke dalam memori runtime tab yang mengeksekusi
    if (tabRuntimeStates[executingTabId]) {
      tabRuntimeStates[executingTabId].isSending = false;
      tabRuntimeStates[executingTabId].res = res;
      tabRuntimeStates[executingTabId].time = time;
    }

    // HANYA RENDER KE SCREEN JIKA USER SEDANG MEMBUKA TAB INI
    if (tabs.activeId === executingTabId) {
      renderStatus(res, time);
      renderResponse(res, time);
    }

    // ================= POST SCRIPT =================
    const postCtx = createContext(tab, res, runtimeVariables);
    runScript(tab.scripts?.post, postCtx);

  } catch (err) {
    console.error(err);
    
    if (executingTabId && tabs.activeId === executingTabId) {
      ui.response.textContent = err.message;
    }
  } finally {
    // Kembalikan status loading tab terkait ke false
    if (executingTabId && tabRuntimeStates[executingTabId]) {
      tabRuntimeStates[executingTabId].isSending = false;
    }

    // Kembalikan tombol send ke normal HANYA jika tab aktif saat ini adalah tab tersebut
    if (executingTabId && tabs.activeId === executingTabId) {
      ui.send.disabled = false;
      ui.send.textContent = "Send Request";
    }
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
            const name = prompt("Rename tab");
            if (name) {
                tabs.rename(tab, name);
                //tabs.render();
                saveActiveCollectionState();
                renderCollections();
                //INI TAB
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
    },
    {
      label: "Delete",
      action: () => {
        tabs.delete(tab.id);
        saveActiveCollectionState();
        renderCollections();
      }
    }
  ]);
});


function saveActiveCollectionState() {

  const active = collections
    .getCollections()
    .find(c => c.id === activeCollectionId);

  if (!active) return;

  active.tabs = structuredClone(tabs.tabs);
  active.activeTabId = tabs.activeId;
  active.environment = structuredClone(Environment.getAll());

  // ================= FIX BUG SIDEBAR UNTUK REQUEST DI DALAM FOLDER =================
  const activeTab = tabs.getActive();
  if (activeTab) {
    const updatedFields = {
      method: activeTab.method,
      name: activeTab.name
    };

    // 1. Sinkronkan jika request berada di root collection
    if (active.requests && Array.isArray(active.requests)) {
      const rootReq = active.requests.find(r => r.id === activeTab.id);
      if (rootReq) {
        Object.assign(rootReq, updatedFields);
      }
    }

    // 2. Sinkronkan secara rekursif jika request berada di dalam folder/sub-folder
    const updateRequestInTree = (folders) => {
      if (!folders || !Array.isArray(folders)) return false;
      for (const folder of folders) {
        // Cek request di dalam folder ini
        if (folder.requests && Array.isArray(folder.requests)) {
          const folderReq = folder.requests.find(r => r.id === activeTab.id);
          if (folderReq) {
            Object.assign(folderReq, updatedFields);
            return true; // Ketemu dan sukses di-update
          }
        }
        // Rekursi ke sub-folder di dalamnya jika ada
        if (folder.folders && updateRequestInTree(folder.folders)) {
          return true;
        }
      }
      return false;
    };

    if (active.folders) {
      updateRequestInTree(active.folders);
    }
  }
  // ==================================================================================

  collections.save?.();
}

window.saveActiveCollectionState =
  saveActiveCollectionState;

function loadCollectionState(collectionId) {

  const col = collections
    .getCollections()
    .find(c => c.id === collectionId);

  if (!col) return;

  if (!col.tabs) col.tabs = [];
  if (!col.environment) col.environment = {};

  activeCollectionId = col.id;

  // restore tabs
  tabs.tabs = structuredClone(col.tabs);
  tabs.activeId = col.activeTabId;

  tabs.render();
  tabs.syncForm();

  // restore env
  Environment.clear?.();

  Object.entries(col.environment).forEach(([k, v]) => {
    Environment.set(k, v);
  });

  renderEnvViewer();

  renderParams();
  renderHeaders();
  renderScripts();
}
ui.newCollection.onclick = () => {

  // save current collection dulu
  saveActiveCollectionState();

  // create collection baru
  const col = collections.createCollection(
    "Collection " + Date.now()
  );

  // set active
  activeCollectionId = col.id;

  // init kosong
  col.tabs = [];
  col.activeTabId = null;
  col.environment = {};

  // reset workspace
  tabs.tabs = [];
  tabs.activeId = null;

  Environment.clear?.();

  collections.save?.();

  tabs.render();
  tabs.syncForm();

  renderEnvViewer();
  renderCollections();
};

ui.newTab?.addEventListener("click", () => {

  saveActiveCollectionState();

  tabs.create();

  saveActiveCollectionState();
});
ui.addRequest?.addEventListener("click", () => {

  saveActiveCollectionState();

  tabs.create();

  saveActiveCollectionState();
});

ui.method?.addEventListener("change", scheduleSync);
ui.url?.addEventListener("input", scheduleSync);
ui.body?.addEventListener("input", scheduleSync);

ui.body?.addEventListener(
   "blur",
   () => {
      tabs.syncTab();
      tabs.save();
   }
);

ui.preScript = document.getElementById("preScript");
ui.postScript = document.getElementById("postScript");



function scheduleSync() {
  clearTimeout(syncTimer);

  syncTimer = setTimeout(() => {
    tabs.syncTab();

    tabs.commit();
    saveActiveCollectionState();
    renderCollections();
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
    tabs.syncTab(); //  ini penting banget
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
  importUniversal(e.target.files[0]);
});



async function importUniversal(file) {
  const text = await file.text();
  const data = JSON.parse(text);

  const type = detectFormat(data);

  if (type === "postman") {
    const mod = await import("./core/importers/postman-importer.js");
    const result = mod.importPostmanCollection?.(data);

if (!result || !result.collections) {
  console.error("Import failed:", result);
  return;
}

collections.importWorkspace(JSON.stringify({
  collections: result.collections
}));

renderCollections();
return;
  }

  if (type === "postdim") {
    importWorkspace(file);
    return;
  }

  throw new Error("Unknown format");
}
export function detectFormat(data) {
  if (data?.info?._postman_id) return "postman";
  if (data?.collections || data?.tabs) return "postdim";
  return "unknown";
}

function buildUrlWithParams(url, params) {
  const query = new URLSearchParams(params).toString();
  return query ? `${url}?${query}` : url;
}



document.querySelectorAll(".body-tab").forEach(btn => {
  btn.addEventListener("click", () => {

    const mode = btn.dataset.mode;
    const tab = tabs.getActive();
    if (!tab) return;

    // 🔥 FORCE NORMALIZE BODY
    if (!tab.body || typeof tab.body !== "object") {
      tab.body = {
        mode: "none",
        raw: typeof tab.body === "string" ? tab.body : "",
        formData: [],
        urlencoded: []
      };
    }

    tab.body.mode = mode;

    tabs.save();

    renderBodyUI(tab.body);

    document.querySelectorAll(".body-tab")
      .forEach(b => b.classList.remove("active"));

    btn.classList.add("active");
  });
});

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



// ================= RESPONSE TABS =================
document
  .querySelectorAll(".response-tab")
  .forEach(tab => {

    tab.addEventListener(
      "click",
      () => {

        document
          .querySelectorAll(
            ".response-tab"
          )
          .forEach(x =>
            x.classList.remove(
              "active"
            )
          );

        tab.classList.add(
          "active"
        );

        document
          .querySelectorAll(
            ".response-panel"
          )
          .forEach(x =>
            x.classList.add(
              "hidden"
            )
          );

        document
          .getElementById(
            "response" +
            tab.dataset.tab
              .charAt(0)
              .toUpperCase() +
            tab.dataset.tab
              .slice(1)
          )
          ?.classList.remove(
            "hidden"
          );

      }
    );

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

// tabs.setActive = (id) => {

//   // save current collection dulu
//   saveActiveCollectionState();

//   // cari owner collection
//   const owner = collections
//     .getCollections()
//     .find(c =>
//       c.tabs?.some(t => t.id === id)
//     );

//   // kalau pindah collection → restore workspace collection tsb
//   if (
//     owner &&
//     owner.id !== activeCollectionId
//   ) {
//     loadCollectionState(owner.id);
//   }

//   originalSetActive(id);

//   renderParams();
//   renderHeaders();

//   const tab = tabs.getActive();

//   if (tab) {

//     // normalize body
//     tab.body ||= {
//       mode: "none",
//       raw: "",
//       formData: [],
//       urlencoded: []
//     };

//     tab.body.formData ||= [];
//     tab.body.urlencoded ||= [];

//     // restore raw editor
//     ui.body.value =
//       tab.body.raw || "";

//     // restore body mode
//     document
//       .querySelectorAll(".body-tab")
//       .forEach(x =>
//         x.classList.remove("active")
//       );

//     document
//       .querySelector(
//         `.body-tab[data-mode="${
//           tab.body.mode || "none"
//         }"]`
//       )
//       ?.classList.add("active");

//     renderBodyUI(tab.body);
//   }

//   syncScriptToTab();
//   renderScripts();

//   saveActiveCollectionState();
// };

tabs.setActive = (id) => {
  // save current collection dulu
  saveActiveCollectionState();

  // cari owner collection
  const owner = collections
    .getCollections()
    .find(c =>
      c.tabs?.some(t => t.id === id)
    );

  // kalau pindah collection → restore workspace collection tsb
  if (
    owner &&
    owner.id !== activeCollectionId
  ) {
    loadCollectionState(owner.id);
  }

  originalSetActive(id);

  renderParams();
  renderHeaders();

  const tab = tabs.getActive();

  if (tab) {
    // normalize body
    tab.body ||= {
      mode: "none",
      raw: "",
      formData: [],
      urlencoded: []
    };

    tab.body.formData ||= [];
    tab.body.urlencoded ||= [];

    // restore raw editor
    ui.body.value = tab.body.raw || "";

    // restore body mode
    document
      .querySelectorAll(".body-tab")
      .forEach(x => x.classList.remove("active"));

    document
      .querySelector(`.body-tab[data-mode="${tab.body.mode || "none"}"]`)
      ?.classList.add("active");

    renderBodyUI(tab.body);
  }

  syncScriptToTab();
  renderScripts();

  // --- TAMBAHKAN PEMULIHAN STATE UI DI SINI ---
  const runtimeState = tabRuntimeStates[id] || { isSending: false, res: null, time: 0 };

  // 1. Pulihkan kondisi tombol send untuk tab ini
  if (runtimeState.isSending) {
    ui.send.disabled = true;
    ui.send.textContent = "Sending...";
  } else {
    ui.send.disabled = false;
    ui.send.textContent = "Send Request";
  }

  // 2. Pulihkan data panel response milik tab ini atau bersihkan jika kosong
  if (runtimeState.res) {
    renderStatus(runtimeState.res, runtimeState.time);
    renderResponse(runtimeState.res, runtimeState.time);
  } else {
    // Jika tidak ada data response di RAM, bersihkan elemen DOM response agar tidak bocor dari tab lain
    const bodyBox = document.getElementById("responseBody");
    const headerBox = document.getElementById("responseHeaders");
    const cookieBox = document.getElementById("responseCookies");
    if (bodyBox) bodyBox.innerHTML = "";
    if (headerBox) headerBox.innerHTML = "";
    if (cookieBox) cookieBox.innerHTML = "";
    if (ui.statusBar) ui.statusBar.innerHTML = "";
  }
  // --------------------------------------------

  saveActiveCollectionState();
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
        headers: buildFinalHeaders?.() || {}, // penting: resolved headers
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

  saveActiveCollectionEnv();
};

    // rename key
    row.querySelector(".k").onblur = (e) => {
      const newKey = e.target.value.trim();
      if (!newKey || newKey === key) return;

      const val = Environment.get(key);

      Environment.set(newKey, val);
      Environment.remove(key); // 🔥 FIX IMPORTANT
      saveActiveCollectionEnv();
      renderEnvViewer();
    };

    // delete
    row.querySelector(".del").onclick = () => {
      Environment.remove(key);
       saveActiveCollectionEnv();
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
  envPanel.classList.remove("hidden");
  envPanel.classList.add("show");
  renderEnvViewer();
});

document.getElementById("closeEnvPanel")?.addEventListener("click", () => {
  envPanel.classList.remove("show");
  envPanel.classList.add("hidden");
});


function initMonaco() {
  require.config({ paths: { vs: "./lib/js/monaco-editor/min/vs" } });

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

function downloadJSON(data, filename) {

  const blob = new Blob(
    [JSON.stringify(data, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");

  a.href = url;
  a.download = filename;

  a.click();

  URL.revokeObjectURL(url);
}
function exportCollectionAsPostman(collectionId) {

  const collection = collections
    .getCollections()
    .find(c => c.id === collectionId);

  if (!collection) return;

  const data =
    exportPostmanCollection(collection);

  downloadJSON(
    data,
    `${collection.name}.postman_collection.json`
  );
}
function importPostman(file) {
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);

      const result = importPostmanCollection(data);

      collections.importWorkspace(JSON.stringify({
        collections: result.collections
      }));

      renderCollections();

      console.log("[Postman Import] success");

    } catch (err) {
      console.error("[Postman Import ERROR]", err);
    }
  };

  reader.readAsText(file);
}







function renderUrlEncoded(body) {

  const tab = tabs.getActive();
  if (!tab) return;

  tab.body ||= { mode: "urlencoded", urlencoded: [] };
  tab.body.urlencoded ||= [];

  const list = tab.body.urlencoded;

  const box = document.getElementById("urlencodedList");
  if (!box) return;

  box.innerHTML = "";

  const header = document.createElement("div");
  header.className = "row header";
  header.innerHTML = `
    <div></div>
    <div>Key</div>
    <div>Value</div>
    <div></div>
    <div></div>
  `;
  box.appendChild(header);

  list.forEach((item, i) => {

    const row = document.createElement("div");
    row.className = "row";

    row.innerHTML = `
      <input type="checkbox" class="toggle" ${item.enabled !== false ? "checked" : ""}>
      <input class="key" value="${item.key || ""}">
      <input class="value" value="${item.value ?? ""}">
      <div></div>
      <button class="del">x</button>
    `;

    const toggle = row.querySelector(".toggle");
    const key = row.querySelector(".key");
    const value = row.querySelector(".value");

    toggle.onchange = (e) => {
      item.enabled = e.target.checked;
        tabs.commit();
  saveActiveCollectionState();
    };

    key.oninput = (e) => {
      item.key = e.target.value;
        tabs.commit();
  saveActiveCollectionState();
    };

    value && (value.oninput = (e) => {
  item.value = e.target.value;
   tabs.commit();
  saveActiveCollectionState();
});

    row.querySelector(".del").onclick = () => {
      tab.body.urlencoded.splice(i, 1);
      
      renderUrlEncoded();
        tabs.commit();
  saveActiveCollectionState();
    };

    box.appendChild(row);
  });
}

document.getElementById("addUrlEncoded")?.addEventListener("click", () => {
  const tab = tabs.getActive();
  if (!tab) return;

  tab.body ||= { mode: "urlencoded", urlencoded: [] };
  tab.body.urlencoded.push({ key: "", value: "" });

  renderBodyUI(tab.body);
});
function renderFormData(body) {

  const tab = tabs.getActive();
  if (!tab) return;

  tab.body ||= { mode: "form-data", formData: [] };
  tab.body.formData ||= [];

  const list = tab.body.formData;

  const box = document.getElementById("formDataList");
  if (!box) return;

  box.innerHTML = "";

  const header = document.createElement("div");
  header.className = "row header";
  header.innerHTML = `
    <div></div>
    <div>Key</div>
    <div>Value</div>
    <div>Type</div>
    <div></div>
  `;
  box.appendChild(header);

  list.forEach((item, i) => {

    const row = document.createElement("div");
    row.className = "row";

    row.innerHTML = `
  <input type="checkbox" class="toggle"
    ${item.enabled !== false ? "checked" : ""}>

  <input class="key"
    value="${item.key || ""}">

 ${
  item.type === "file"
    ? `
      <div class="file-cell">

        <input type="file"
          class="file">

        <input
          class="value"
          value="${item.fileName || ""}"
          readonly
          placeholder="No file selected">

      </div>
    `
    : `
      <input class="value"
        value="${item.value ?? ""}">
    `
}

  <select class="type">

    <option value="text"
      ${!item.type || item.type === "text"
        ? "selected"
        : ""}>
      Text
    </option>

    <option value="file"
      ${item.type === "file"
        ? "selected"
        : ""}>
      File
    </option>

  </select>

  <button class="del">x</button>
`;

    const toggle = row.querySelector(".toggle");
    const key = row.querySelector(".key");
    const value = row.querySelector(".value");
    const file = row.querySelector(".file");
    const type = row.querySelector(".type");

    // ENABLE / DISABLE
    toggle.onchange = (e) => {
      item.enabled = e.target.checked;
      tabs.commit();
saveActiveCollectionState();
    };

    // KEY
    key.oninput = (e) => {
      item.key = e.target.value;
      tabs.commit();
saveActiveCollectionState();
    };
    value && (value.oninput = (e) => {
  item.value = e.target.value;
  tabs.commit();
saveActiveCollectionState();
});

    // FILE (UNCHANGED LOGIC)
    // file?.addEventListener("change", (e) => {
    //   const f = e.target.files?.[0];
    //   if (!f) return;

    //   item.file = f;
    //   item.value = f.name;
    //   tabs.save();
    // });

file?.addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  if (!f) return;

  // runtime only
  item.file = f;

  // persist metadata
  item.fileName = f.name;
  item.fileSize = f.size;
  item.fileType = f.type;

  item.value = f.name;

  tabs.commit();
  saveActiveCollectionState();
});

if (item.type === "file" && item.fileName) {
  const info = document.createElement("div");
  info.textContent = item.fileName;

  row.appendChild(info);
}

    // TYPE SWITCH
    type.onchange = (e) => {
      item.type = e.target.value;

      if (item.type === "file") item.value = "";
      else item.file = null;

      
      renderFormData(tab.body);
      tabs.commit();
saveActiveCollectionState();
    };

    // DELETE
    row.querySelector(".del").onclick = () => {
      tab.body.formData.splice(i, 1);
    
      renderFormData(tab.body);
        tabs.commit();
saveActiveCollectionState();
    };

    box.appendChild(row);
  });
}

document.getElementById("addFormData")?.addEventListener("click", () => {
  const tab = tabs.getActive();
  if (!tab) return;

  tab.body ||= {
    mode: "form-data",
    raw: "",
    formData: [],
    urlencoded: []
  };

  if (!Array.isArray(tab.body.formData)) {
    tab.body.formData = [];
  }

  tab.body.formData.push({ key: "", value: "" });

  renderBodyUI(tab.body);
  tabs.commit();
saveActiveCollectionState();
});
function renderBodyUI(body) {

  const raw = document.getElementById("rawBodyBox");
  const form = document.getElementById("formDataBox");
  const urlenc = document.getElementById("urlencodedBox");

  raw.classList.add("hidden");
  form.classList.add("hidden");
  urlenc.classList.add("hidden");
  

  if (!body || body.mode === "none") return;

  GraphqlHandler.renderUI(body);
  GrpcHandler.renderUI(body);

  if (body.mode === "raw") {
    raw.classList.remove("hidden");
  }

  if (body.mode === "form-data") {
    form.classList.remove("hidden");
    renderFormData(body);
  }

  if (body.mode === "urlencoded") {
    urlenc.classList.remove("hidden");
    renderUrlEncoded(body);
  }
}
bodyMode?.addEventListener("change", () => {
  const tab = tabs.getActive();
  if (!tab) return;

  tab.body ||= {};

  tab.body.mode = bodyMode.value;

  renderBodyUI(tab.body);
  tabs.save();
});


function renderTreeFolder(items, level = 0) {
  let html = '';
  const padding = level * 15; // Indentasi setiap level

  items.forEach(item => {
      // Render Folder
      if (item.type === 'folder' || item.folders) {
          html += `
              <div class="folder-item" style="padding-left: ${padding}px" data-id="${item.id}">
                  <i class="folder-icon">📁</i> ${item.name}
              </div>
              <div class="folder-children">
                  ${renderTree(item.folders || [], level + 1)}
                  ${renderTree(item.requests || [], level + 1)}
              </div>
          `;
      } 
      // Render Request
      else {
          html += `
              <div class="request-item" style="padding-left: ${padding}px" data-id="${item.id}">
                  <span class="method-${item.method}">${item.method}</span> ${item.name}
              </div>
          `;
      }
  });
  return html;
}



function normalizeValue(item) {
  if (item.enabled === false) return null;
  return item.value ?? "";
}

ui.body?.addEventListener("blur", () => {
   tabs.syncTab();
   tabs.save();
});