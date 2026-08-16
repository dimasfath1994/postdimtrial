import { Storage } from "../core/storage.js";

export class Tabs {

  constructor(ui, collections) {
    this.ui = ui;
    this.tabs = [];
    this.activeId = null;

    this.onUpdate = null;

    // prevent UI ↔ storage ↔ sync loop
    this._syncing = false;
    this.collections = collections;
    this.load();
  }

  // ================= CREATE =================
  create(collectionId = null, folderId = null) {
    const tab = this._createDefaultTab();

    const newTab = {
      ...tab, 
      collectionId: collectionId,
      folderId: folderId
    };

    this.tabs.push(newTab);
    
    if (collectionId) {
      this.collections.addRequest(collectionId, newTab, folderId);
    }

    this.commit();
    this.setActive(newTab.id);
    
    if (this.onUpdate) this.onUpdate();
    
    return newTab;
  }

  openRequest(request) {
    let existingTab = this.tabs.find(t => t.id === request.id);
    const isGrpcReq = (request.method || "").toUpperCase() === "GRPC";

    if (existingTab) {
        existingTab.opened = true; 
        if (isGrpcReq) {
          existingTab.body.mode = "grpc";
        }
        this.setActive(existingTab.id);
    } else {
        const newTab = {
            id: request.id,
            name: request.name,
            method: request.method || "GET",
            url: request.url || "",
            body: typeof request.body === "object" ? {
              mode: request.body.mode || (isGrpcReq ? "grpc" : "raw"),
              ...request.body,
              grpc: {
                protoFileName: request.body.grpc?.protoFileName || "",
                serviceMethod: request.body.grpc?.serviceMethod || "",
                body: request.body.grpc?.body || "",
                metadata: request.body.grpc?.metadata || []
              }
            } : {
              mode: isGrpcReq ? "grpc" : "none",
              raw: request.body || "",
              formData: [],
              urlencoded: [],
              graphql: { query: "", variables: "" },
              grpc: { protoFileName: "", serviceMethod: "", body: "", metadata: [] }
            },
            collectionId: request.collectionId || null,
            folderId: request.folderId || null,
            opened: true,
            params: request.params || {},
            headers: request.headers || {},
            auth: request.auth || { type: "", value: "" },
            scripts: request.scripts || { pre: "", post: "" }
        };
        this.tabs.push(newTab);
        this.save();
        this.setActive(newTab.id);
    }

    this.render();
  }

  delete(tabId) {
    this.tabs = this.tabs.filter(t => t.id !== tabId);

    if (this.activeId === tabId) {
      this.activeId = this.tabs[0]?.id || null;
    }

    this.save();
    this.render();
    this.syncForm();
  }

  _createDefaultTab() {
    return {
      id: Date.now(),
      name: `Request ${this.tabs.length + 1}`,
      method: "GET",
      url: "",
      body: {
        mode: "none",
        raw: "",
        formData: [],
        urlencoded: [],
        graphql: {
          query: "",
          variables: ""
        },
        grpc: {
          protoFileName: "",
          serviceMethod: "",
          body: "",
          metadata: []
        }
      },
      history: [],
      pinned: false,
      opened: true,

      params: {},
      headers: {},

      auth: {
        type: "",
        value: ""
      },

      scripts: {
        pre: "",
        post: ""
      }
    };
  }

  // ================= ACTIVE =================
  setActive(id) {
    this.activeId = id;

    this.commit();
    this.render();
    this.syncForm();
  }

  getActive() {
    return this.tabs.find(t => t.id === this.activeId);
  }

  // ================= HISTORY =================
  addHistory(response) {
    const tab = this.getActive();
    if (!tab) return;

    tab.history ||= [];

    tab.history.unshift({
      timestamp: Date.now(),
      response
    });

    if (tab.history.length > 20) {
      tab.history.pop();
    }

    this.commit();
  }

  close(id) {
    const tab = this.tabs.find(t => t.id === id);
    if (!tab) return;

    tab.opened = false;

    if (this.activeId === id) {
      const next = this.tabs.find(t => t.opened !== false);
      this.activeId = next?.id || null;
    }

    this.commit();
    window.saveActiveCollectionState?.();
    this.render();
  }

  // ================= RENAME =================
  rename(tab, name) {
    tab.name = name?.trim() || "Untitled";

    const col = this.collections.getCollection(tab.collectionId);
    if (col) {
        const updateNameRecursive = (folders) => {
            for (let f of folders) {
                const req = f.requests?.find(r => r.id === tab.id);
                if (req) { req.name = tab.name; return true; }
                if (f.folders && updateNameRecursive(f.folders)) return true;
            }
            return false;
        };

        if (tab.folderId) updateNameRecursive(col.folders);
        else {
            const req = col.requests?.find(r => r.id === tab.id);
            if (req) req.name = tab.name;
        }

        this.collections.save();
    }

    this.commit();
    this.render();
    this.syncForm();
    window.dispatchEvent(new CustomEvent('request-renamed'));
  }

  renameById(id, name, collectionId, folderId = null) {
    const tab = this.tabs.find(t => t.id === id);
    if (!tab) return;

    tab.name = name?.trim() || "Untitled";
    
    const col = this.collections.getCollection(collectionId);
    if (col) {
        const updateInFolder = (folders) => {
            for (let f of folders) {
                if (f.id === folderId) {
                    const req = f.requests?.find(r => r.id === id);
                    if (req) req.name = tab.name;
                    return true;
                }
                if (f.folders && updateInFolder(f.folders)) return true;
            }
            return false;
        };

        if (folderId) updateInFolder(col.folders);
        else {
            const req = col.requests?.find(r => r.id === id);
            if (req) req.name = tab.name;
        }
        this.collections.save();
    }

    this.commit();
    this.render();
    this.syncForm();
    window.dispatchEvent(new CustomEvent('request-renamed'));
  }

  // ================= DUPLICATE =================
  duplicate(tab) {
    const copy = {
        ...tab,
        id: Date.now(),
        name: `${tab.name} copy`,
    };

    this.tabs.push(copy);

    const col = this.collections.getCollection(tab.collectionId);
    if (col) {
        this.collections.addRequest(tab.collectionId, copy, tab.folderId);
    }

    this.commit();
    this.render();
    this.syncForm();
  }

  // ================= PIN =================
  togglePin(tab) {
    tab.pinned = !tab.pinned;

    this.commit();
    this.render();
  }

  // ================= RENDER =================
  render() {
    const el = this.ui.tabsEl;
    if (!el) return;

    el.innerHTML = "";

    this.tabs.filter(tab => tab.opened !== false).forEach(tab => {
      const div = document.createElement("div");
      div.className = "tab" + (tab.id === this.activeId ? " active" : "");
      div.dataset.id = tab.id;

      const name = document.createElement("div");
      name.className = "tab-name";
      name.contentEditable = true;
      name.innerText = tab.name;

      name.onblur = () => this.rename(tab, name.innerText);

      const close = document.createElement("button");
      close.className = "close";
      close.innerText = "×";

      close.onclick = (e) => {
        e.stopPropagation();
        this.close(tab.id);
      };

      div.onclick = () => this.setActive(tab.id);

      div.appendChild(name);
      div.appendChild(close);

      el.appendChild(div);
    });
  }

  // ================= UI METHOD TOGGLE HELPER =================
  _updateMethodUI(method) {
    const isGrpc = (method || "").toUpperCase() === "GRPC";

    const reqTabs = document.getElementById("reqTabs");
    const grpcReqTabs = document.getElementById("grpcReqTabs");
    const grpcPanelsContainer = document.getElementById("grpcPanelsContainer");

    const paramsPanel = document.querySelector('[data-panel="params"]');
    const bodyPanel = document.querySelector('[data-panel="body"]');
    const headersPanel = document.querySelector('[data-panel="headers"]');

    if (isGrpc) {
      reqTabs?.classList.add("hidden");
      grpcReqTabs?.classList.remove("hidden");
      grpcPanelsContainer?.classList.remove("hidden");

      paramsPanel?.classList.add("hidden");
      bodyPanel?.classList.add("hidden");
      headersPanel?.classList.add("hidden");
    } else {
      reqTabs?.classList.remove("hidden");
      grpcReqTabs?.classList.add("hidden");
      grpcPanelsContainer?.classList.add("hidden");

      // Munculkan kembali panel HTTP aktif (misal params jika itu yang sedang dibuka)
      const activeReqTab = document.querySelector('.req-tab.active:not([data-grpc-tab])');
      const activeTabName = activeReqTab ? activeReqTab.dataset.tab : 'params';
      const activePanel = document.querySelector(`[data-panel="${activeTabName}"]`);
      activePanel?.classList.remove("hidden");
    }
  }

  // ================= SYNC FORM (Tab -> UI) =================
  syncForm() {
    this._syncing = true;

    const tab = this.getActive();
    if (!tab) return;

    if (this.ui.method) this.ui.method.value = tab.method || "GET";
    if (this.ui.url) this.ui.url.value = tab.url || "";

    // Validasi UI murni berdasarkan method tab
    this._updateMethodUI(tab.method);

    if (typeof tab.body === "object") {
      if (this.ui.body) this.ui.body.value = tab.body.raw || "";
    } else {
      if (this.ui.body) this.ui.body.value = tab.body || "";
    }

    if (this.ui.authType) this.ui.authType.value = tab.auth?.type || "";
    if (this.ui.authValue) this.ui.authValue.value = tab.auth?.value || "";

    // Sync GraphQL fields ke UI
    if (this.ui.graphqlQuery) this.ui.graphqlQuery.value = tab.body?.graphql?.query || "";
    if (this.ui.graphqlVariables) this.ui.graphqlVariables.value = tab.body?.graphql?.variables || "";

    // Sync gRPC data values ke UI
    if (this.ui.grpcServiceMethod) this.ui.grpcServiceMethod.value = tab.body?.grpc?.serviceMethod || "";
    if (this.ui.grpcBody) this.ui.grpcBody.value = tab.body?.grpc?.body || "";
    if (this.ui.protoFileName) {
      this.ui.protoFileName.innerText = tab.body?.grpc?.protoFileName || "No .proto loaded";
    }

    // Panggil sinkronisasi state gRPC handler
    window.GrpcHandler?.syncFromState?.(tab, this.ui);

    window.__syncMonacoFromTab?.();

    this._syncing = false;
  }

  // ================= SYNC TAB (UI -> Tab) =================
  syncTab() {
    if (this._syncing) return;

    const tab = this.getActive();
    if (!tab) return;

    tab.method = this.ui.method?.value || "GET";
    tab.url = this.ui.url?.value || "";

    const isGrpc = (tab.method || "").toUpperCase() === "GRPC";

    // Panggil pembersih tampilan UI berdasarkan method secara langsung
    this._updateMethodUI(tab.method);

    tab.body ||= {
      mode: isGrpc ? "grpc" : "none",
      raw: "",
      formData: [],
      urlencoded: [],
      graphql: { query: "", variables: "" },
      grpc: { protoFileName: "", serviceMethod: "", body: "", metadata: [] }
    };

    // Atur mode body secara tegas berdasarkan apakah method-nya gRPC atau bukan
    if (isGrpc) {
      tab.body.mode = "grpc";
    } else {
      if (tab.body.mode === "grpc") {
        tab.body.mode = "none"; // Reset dari grpc jika pindah ke method HTTP (termasuk GET)
      }
    }

    if (tab.body.mode === "raw") {
      tab.body.raw = this.ui.body?.value || "";
    }

    tab.body.graphql ||= { query: "", variables: "" };
    if (tab.body.mode === "graphql") {
      tab.body.graphql.query = this.ui.graphqlQuery?.value || "";
      tab.body.graphql.variables = this.ui.graphqlVariables?.value || "";
    }

    tab.body.grpc ||= { protoFileName: "", serviceMethod: "", body: "", metadata: [] };
    
    // HANYA ambil data gRPC jika method-nya benar-benar GRPC
    if (isGrpc) {
      tab.body.mode = "grpc";
      tab.body.grpc.serviceMethod = this.ui.grpcServiceMethod?.value || "";
      tab.body.grpc.body = this.ui.grpcBody?.value || "";
      tab.body.grpc.metadata ||= [];
    }

    tab.formData ||= [];
    tab.urlencoded ||= [];

    tab.auth = {
      type: this.ui.authType?.value || "",
      value: this.ui.authValue?.value || ""
    };

    tab.scripts ||= { pre: "", post: "" };

    this.commit();
  }

  // ================= STORAGE =================
  save() {
    Storage.save({
      tabs: this.tabs || [],
      activeId: this.activeId || null
    });
  }

  // ================= COMMIT (IMPORTANT) =================
  commit() {
    this.save();
    window.__pushSync?.();
  }

  // ================= LOAD =================
  load() {
    const data = Storage.load();

    if (data?.tabs?.length) {
      this.tabs = data.tabs.map(tab => {
        const isGrpcTab = (tab.method || "").toUpperCase() === "GRPC" || tab.body?.mode === "grpc";
        return {
          id: tab.id,
          name: tab.name || "Untitled",
          method: tab.method || "GET",
          url: tab.url || "",
          body: typeof tab.body === "object"
            ? {
                mode: tab.body.mode || (isGrpcTab ? "grpc" : "raw"),
                raw: tab.body.raw || "",
                formData: tab.body.formData || [],
                urlencoded: tab.body.urlencoded || [],
                graphql: tab.body.graphql || { query: "", variables: "" },
                grpc: {
                  protoFileName: tab.body.grpc?.protoFileName || "",
                  serviceMethod: tab.body.grpc?.serviceMethod || "",
                  body: tab.body.grpc?.body || "",
                  metadata: tab.body.grpc?.metadata || []
                }
              }
            : {
                mode: isGrpcTab ? "grpc" : "raw",
                raw: tab.body || "",
                formData: [],
                urlencoded: [],
                graphql: { query: "", variables: "" },
                grpc: { protoFileName: "", serviceMethod: "", body: "", metadata: [] }
              },
          history: Array.isArray(tab.history) ? tab.history : [],
          pinned: !!tab.pinned,
          opened: tab.opened === undefined ? true : tab.opened,

          params: tab.params || {},
          headers: tab.headers || {},

          auth: tab.auth || { type: "", value: "" },

          scripts: {
            pre: tab.scripts?.pre || "",
            post: tab.scripts?.post || ""
          }
        };
      });

      const exists = this.tabs.helpers?.find?.(t => t.id === data.activeId) || this.tabs.find(t => t.id === data.activeId);
      this.activeId = exists ? data.activeId : this.tabs[0].id;

    } else {
      this.create();
    }
  }
}