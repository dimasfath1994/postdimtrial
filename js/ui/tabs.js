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
    
    // Kirim objek newTab langsung ke addRequest
    if (collectionId) {
      this.collections.addRequest(collectionId, newTab, folderId);
    }

    this.commit();
    this.setActive(newTab.id);
    
    if (this.onUpdate) this.onUpdate();
    
    return newTab;
  }

  openRequest(request) {
    // 1. Cek apakah tab dengan ID request ini ada di daftar tab
    let existingTab = this.tabs.find(t => t.id === request.id);

    if (existingTab) {
        existingTab.opened = true; 
        this.setActive(existingTab.id);
    } else {
        // Jika belum ada sama sekali, buat tab baru
        const newTab = {
            id: request.id,
            name: request.name,
            method: request.method || "GET",
            url: request.url || "",
            body: typeof request.body === "object" ? request.body : {
              mode: "none",
              raw: request.body || "",
              formData: [],
              urlencoded: [],
              graphql: { query: "", variables: "" },
              grpc: { protoFileName: "", serviceMethod: "", body: "" }
            },
            collectionId: request.collectionId || null,
            folderId: request.folderId || null,
            opened: true
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
        // ADDED: GraphQL & gRPC data structure
        graphql: {
          query: "",
          variables: ""
        },
        grpc: {
          protoFileName: "",
          serviceMethod: "",
          body: ""
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

    this.commit(); // save + sync

    window.saveActiveCollectionState?.();

    this.render();
  }

  // ================= RENAME =================
  rename(tab, name) {
    console.log("Tab ditemukan:", tab);
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
    console.log("Tab ditemukan:", tab);
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

  // ================= SYNC FORM (Tab -> UI) =================
  syncForm() {
    this._syncing = true;

    const tab = this.getActive();
    if (!tab) return;

    if (this.ui.method) this.ui.method.value = tab.method || "GET";
    if (this.ui.url) this.ui.url.value = tab.url || "";

    if (typeof tab.body === "object") {
      if (this.ui.body) this.ui.body.value = tab.body.raw || "";
    } else {
      if (this.ui.body) this.ui.body.value = tab.body || "";
    }

    if (this.ui.authType) this.ui.authType.value = tab.auth?.type || "";
    if (this.ui.authValue) this.ui.authValue.value = tab.auth?.value || "";

    // ADDED: Sync GraphQL fields ke UI
    if (this.ui.graphqlQuery) this.ui.graphqlQuery.value = tab.body?.graphql?.query || "";
    if (this.ui.graphqlVariables) this.ui.graphqlVariables.value = tab.body?.graphql?.variables || "";

    // ADDED: Sync gRPC fields ke UI
    if (this.ui.grpcServiceMethod) this.ui.grpcServiceMethod.value = tab.body?.grpc?.serviceMethod || "";
    if (this.ui.grpcBody) this.ui.grpcBody.value = tab.body?.grpc?.body || "";
    if (this.ui.protoFileName) {
      this.ui.protoFileName.innerText = tab.body?.grpc?.protoFileName || "No .proto loaded";
    }

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

    tab.body ||= {
      mode: "none",
      raw: "",
      formData: [],
      urlencoded: [],
      graphql: { query: "", variables: "" },
      grpc: { protoFileName: "", serviceMethod: "", body: "" }
    };

    // HANYA RAW YANG DISYNC DARI TEXTAREA
    if (tab.body.mode === "raw") {
      tab.body.raw = this.ui.body?.value || "";
    }

    // ADDED: Sync dari UI ke Tab Object jika mode GraphQL/gRPC
    tab.body.graphql ||= { query: "", variables: "" };
    if (tab.body.mode === "graphql") {
      tab.body.graphql.query = this.ui.graphqlQuery?.value || "";
      tab.body.graphql.variables = this.ui.graphqlVariables?.value || "";
    }

    tab.body.grpc ||= { protoFileName: "", serviceMethod: "", body: "" };
    if (tab.body.mode === "grpc" || tab.method === "GRPC") {
      tab.body.grpc.serviceMethod = this.ui.grpcServiceMethod?.value || "";
      tab.body.grpc.body = this.ui.grpcBody?.value || "";
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
      this.tabs = data.tabs.map(tab => ({
        id: tab.id,
        name: tab.name || "Untitled",
        method: tab.method || "GET",
        url: tab.url || "",
        body: typeof tab.body === "object"
          ? {
              mode: tab.body.mode || "raw",
              raw: tab.body.raw || "",
              formData: tab.body.formData || [],
              urlencoded: tab.body.urlencoded || [],
              // ADDED: Safe fallback untuk tab lama
              graphql: tab.body.graphql || { query: "", variables: "" },
              grpc: tab.body.grpc || { protoFileName: "", serviceMethod: "", body: "" }
            }
          : {
              mode: "raw",
              raw: tab.body || "",
              formData: [],
              urlencoded: [],
              graphql: { query: "", variables: "" },
              grpc: { protoFileName: "", serviceMethod: "", body: "" }
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
      }));

      const exists = this.tabs.find(t => t.id === data.activeId);
      this.activeId = exists ? data.activeId : this.tabs[0].id;

    } else {
      this.create();
    }
  }
}