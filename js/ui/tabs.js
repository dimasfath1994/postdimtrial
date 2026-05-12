import { Storage } from "../core/storage.js";
import { normalizeBody } from "../core/normalize-body.js";

function safeClone(obj) {
  return structuredClone(obj || {});
}

function defaultBody() {
  return {
    mode: "none",
    raw: "",
    formData: [],
    urlencoded: []
  };
}

export class Tabs {

  constructor(ui) {
    this.ui = ui;
    this.tabs = [];
    this.activeId = null;

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

      body: defaultBody(),
      bodyMode: "raw",

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

    const tab = this.getActive();
    normalizeBody(tab);

    this.commit();
    this.render();
    this.syncForm();
  }

  getActive() {
    return this.tabs.find(t => t.id === this.activeId);
  }

  // ================= DUPLICATE (FIX IMPORTANT) =================
  duplicate(tab) {
    const copy = safeClone(tab);

    copy.id = Date.now();
    copy.name = `${tab.name} copy`;

    copy.body = safeClone(tab.body) || defaultBody();
    copy.formData = safeClone(tab.formData);
    copy.urlencoded = safeClone(tab.urlencoded);

    copy.params = safeClone(tab.params);
    copy.headers = safeClone(tab.headers);
    copy.auth = safeClone(tab.auth);

    copy.scripts = {
      pre: tab.scripts?.pre || "",
      post: tab.scripts?.post || ""
    };

    copy.history = Array.isArray(tab.history) ? [...tab.history] : [];

    this.tabs.push(copy);

    this.commit();
    this.render();
    this.syncForm();
  }

  // ================= SYNC FORM =================
  syncForm() {
    this._syncing = true;

    const tab = this.getActive();
    if (!tab) return;

    normalizeBody(tab);

    this.ui.method.value = tab.method || "GET";
    this.ui.url.value = tab.url || "";

    // 🔥 FIX: jangan overwrite raw dari string/object sembarangan
    this.ui.body.value = tab.body?.raw ?? "";

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

    normalizeBody(tab);

    tab.method = this.ui.method?.value || "GET";
    tab.url = this.ui.url?.value || "";

    if (!tab.body || typeof tab.body !== "object") {
      tab.body = defaultBody();
    }

    if (tab.body.mode === "raw") {
      tab.body.raw = this.ui.body?.value || "";
    }

    tab.auth = {
      type: this.ui.authType?.value || "",
      value: this.ui.authValue?.value || ""
    };

    tab.scripts ||= { pre: "", post: "" };
    tab.bodyMode ||= "raw";

    this.commit();
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

  rename(tab, name) {
    tab.name = name?.trim() || "Untitled";
    this.commit();
  }

  save() {
    Storage.save({
      tabs: this.tabs || [],
      activeId: this.activeId || null
    });
  }

  commit() {
    this.save();
    window.__pushSync?.();
  }

  // ================= LOAD (FIX ISOLATION BODY) =================
  load() {
    const data = Storage.load();

    if (data?.tabs?.length) {

      this.tabs = data.tabs.map(tab => ({
        id: tab.id,
        name: tab.name || "Untitled",
        method: tab.method || "GET",
        url: tab.url || "",

        body: {
          mode: tab.body?.mode || "none",
          raw: tab.body?.raw || "",
          formData: safeClone(tab.body?.formData || []),
          urlencoded: safeClone(tab.body?.urlencoded || [])
        },

        bodyMode: tab.bodyMode || "raw",

        history: Array.isArray(tab.history) ? tab.history : [],
        pinned: !!tab.pinned,

        params: safeClone(tab.params),
        headers: safeClone(tab.headers),

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