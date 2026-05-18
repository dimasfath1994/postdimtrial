import { Storage } from "../core/storage.js";

export class Tabs {

  constructor(ui) {

    this.ui = ui;

    this.tabs = [];
    this.activeId = null;

    this._syncing = false;

    this.load();

    // IMPORTANT:
    this.bindInputs();
  }

  // ================= INPUT BIND =================
  bindInputs() {

    this.ui.method?.addEventListener(
      "change",
      () => this.syncTab()
    );

    this.ui.url?.addEventListener(
      "input",
      () => this.syncTab()
    );

    this.ui.body?.addEventListener(
      "input",
      () => this.syncTab()
    );

    this.ui.authType?.addEventListener(
      "change",
      () => this.syncTab()
    );

    this.ui.authValue?.addEventListener(
      "input",
      () => this.syncTab()
    );
  }

  // ================= CREATE =================
  create() {

    const tab =
      this._createDefaultTab();

    this.tabs.push(tab);

    this.commit();

    this.setActive(tab.id);
  }

  delete(tabId) {

    this.tabs =
      this.tabs.filter(
        t => t.id !== tabId
      );

    if (
      this.activeId === tabId
    ) {

      this.activeId =
        this.tabs[0]?.id
        || null;
    }

    this.save();

    this.render();

    this.syncForm();
  }

  _createDefaultTab() {

    return {

      id: Date.now(),

      name:
        `Request ${this.tabs.length + 1}`,

      method: "GET",

      url: "",

      body: {
        mode: "raw",
        raw: "",
        formData: [],
        urlencoded: []
      },

      history: [],

      pinned: 0,

      opened: true,

      sort_order: 0,

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

    return this.tabs.find(
      t => t.id === this.activeId
    );
  }

  // ================= HISTORY =================
  addHistory(response) {

    const tab =
      this.getActive();

    if (!tab) return;

    tab.history ||= [];

    tab.history.unshift({

      timestamp:
        Date.now(),

      response

    });

    if (
      tab.history.length > 20
    ) {

      tab.history.pop();
    }

    this.commit();
  }

  close(id) {

    const tab =
      this.tabs.find(
        t => t.id === id
      );

    if (!tab) return;

    tab.opened = false;

    if (
      this.activeId === id
    ) {

      const next =
        this.tabs.find(
          t =>
            t.opened !== false
        );

      this.activeId =
        next?.id || null;
    }

    this.commit();

    window
      .saveActiveCollectionState?.();

    this.render();
  }

  // ================= RENAME =================
  rename(tab, name) {

    tab.name =
      name?.trim()
      || "Untitled";

    this.commit();
  }

  renameById(id, name) {

    const tab =
      this.tabs.find(
        t => t.id === id
      );

    if (!tab) return;

    tab.name =
      name?.trim()
      || "Untitled";

    this.commit();

    this.render();
  }

  // ================= DUPLICATE =================
  duplicate(tab) {

    const copy = {

      ...structuredClone(tab),

      id: Date.now(),

      name:
        `${tab.name} copy`
    };

    this.tabs.push(copy);

    this.commit();

    this.render();

    this.syncForm();
  }

  // ================= PIN =================
  togglePin(tab) {

    tab.pinned =
      tab.pinned ? 0 : 1;

    this.commit();

    this.render();
  }

  // ================= RENDER =================
  render() {

    const el =
      this.ui.tabsEl;

    if (!el) return;

    el.innerHTML = "";

    this.tabs

      .filter(
        tab =>
          tab.opened !== false
      )

      .forEach(tab => {

      const div =
        document.createElement(
          "div"
        );

      div.className =
        "tab"
        + (
          tab.id === this.activeId
          ? " active"
          : ""
        );

      const name =
        document.createElement(
          "div"
        );

      name.className =
        "tab-name";

      name.contentEditable =
        true;

      name.innerText =
        tab.name;

      name.onblur =
        () =>
          this.rename(
            tab,
            name.innerText
          );

      const close =
        document.createElement(
          "button"
        );

      close.className =
        "close";

      close.innerText =
        "×";

      close.onclick =
        (e) => {

        e.stopPropagation();

        this.close(tab.id);

      };

      div.onclick =
        () =>
          this.setActive(
            tab.id
          );

      div.appendChild(name);

      div.appendChild(close);

      el.appendChild(div);

    });
  }

  // ================= FORM -> UI =================
  syncForm() {

    this._syncing = true;

    const tab =
      this.getActive();

    if (!tab) return;

    this.ui.method.value =
      tab.method || "GET";

    this.ui.url.value =
      tab.url || "";

    this.ui.body.value =
      tab.body?.raw || "";

    if (
      this.ui.authType
    ) {

      this.ui.authType.value =
        tab.auth?.type || "";
    }

    if (
      this.ui.authValue
    ) {

      this.ui.authValue.value =
        tab.auth?.value || "";
    }

    window
      .__syncMonacoFromTab?.();

    this._syncing = false;
  }

  // ================= UI -> TAB =================
  syncTab() {

    if (
      this._syncing
    ) return;

    const tab =
      this.getActive();

    if (!tab) return;

    tab.method =
      this.ui.method?.value
      || "GET";

    tab.url =
      this.ui.url?.value
      || "";

    tab.body ||= {

      mode: "raw",

      raw: "",

      formData: [],

      urlencoded: []
    };

    tab.body.raw =
      this.ui.body?.value
      || "";

    tab.auth = {

      type:
        this.ui.authType?.value
        || "",

      value:
        this.ui.authValue?.value
        || ""
    };

    tab.auth_type =
      tab.auth.type;

    tab.auth_value =
      tab.auth.value;

    tab.pre_script =
      tab.scripts?.pre || "";

    tab.post_script =
      tab.scripts?.post || "";

    this.commit();
  }

  // ================= STORAGE =================
  save() {

    Storage.save({

      tabs:
        this.tabs || [],

      activeId:
        this.activeId || null
    });
  }

  commit() {

    this.save();

    window
      .__pushSync?.();
  }

  // ================= LOAD =================
  load() {

    const data =
      Storage.load();

    if (
      data?.tabs?.length
    ) {

      this.tabs =
        structuredClone(
          data.tabs
        );

      const exists =
        this.tabs.find(
          t =>
            t.id
            === data.activeId
        );

      this.activeId =
        exists
        ? data.activeId
        : this.tabs[0]?.id;

    }
    else {

      this.create();
    }
  }
}