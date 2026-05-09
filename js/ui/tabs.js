import { Storage } from "../core/storage.js";

export class Tabs {

  constructor(ui) {
    this.ui = ui;
    this.tabs = [];
    this.activeId = null;

    // 🔥 prevent UI ↔ storage ↔ sync loop
    this._syncing = false;

    this.load();
  }

  // ================= CREATE =================
  create() {
    const tab = this._createDefaultTab();

    this.tabs.push(tab);
    this.commit();
    this.setActive(tab.id);
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
      body: "",
      history: [],
      pinned: false,

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

  // ================= CLOSE =================
  close(id) {
    const idx = this.tabs.findIndex(t => t.id === id);
    if (idx === -1) return;

    this.tabs.splice(idx, 1);

    if (this.tabs.length === 0) {
      this.create();
      return;
    }

    if (this.activeId === id) {
      this.activeId = this.tabs[idx - 1]?.id || this.tabs[0].id;
    }

    this.commit();
    this.render();
    this.syncForm();
  }

  // ================= RENAME =================
  rename(tab, name) {
    tab.name = name?.trim() || "Untitled";
    this.commit();
  }

  renameById(id, name) {
    const tab = this.tabs.find(t => t.id === id);
    if (!tab) return;

    tab.name = name?.trim() || "Untitled";
    this.commit();
    this.render();
  }

  // ================= DUPLICATE =================
  duplicate(tab) {
    const copy = {
      ...tab,
      id: Date.now(),
      name: `${tab.name} copy`,

      params: structuredClone(tab.params || {}),
      headers: structuredClone(tab.headers || {}),
      auth: structuredClone(tab.auth || { type: "", value: "" }),

      scripts: {
        pre: tab.scripts?.pre || "",
        post: tab.scripts?.post || ""
      },

      history: Array.isArray(tab.history) ? [...tab.history] : []
    };

    this.tabs.push(copy);

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

    this.tabs.forEach(tab => {
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

  // ================= SYNC FORM =================
  syncForm() {
    this._syncing = true;

    const tab = this.getActive();
    if (!tab) return;

    this.ui.method.value = tab.method || "GET";
    this.ui.url.value = tab.url || "";
    this.ui.body.value = tab.body || "";

    if (this.ui.authType)
      this.ui.authType.value = tab.auth?.type || "";

    if (this.ui.authValue)
      this.ui.authValue.value = tab.auth?.value || "";

    window.__syncMonacoFromTab?.();

    this._syncing = false;
  }

  // ================= SYNC TAB =================
  syncTab() {
    if (this._syncing) return;

    const tab = this.getActive();
    if (!tab) return;

    tab.method = this.ui.method?.value || "GET";
    tab.url = this.ui.url?.value || "";
    tab.body = this.ui.body?.value || "";

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

    // 🔥 hook for sync-service
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
        body: tab.body || "",
        history: Array.isArray(tab.history) ? tab.history : [],
        pinned: !!tab.pinned,

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