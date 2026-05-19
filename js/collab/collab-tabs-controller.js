import { API_BASE_URL } from "../core/api/api-config.js";
import { exportPostmanCollection } from "../core/exporters/postman-exporter.js";

export class CollabTabsController {

  constructor({
    tabs,
    state,
    collectionService,
    environment
  }) {

    this.tabs = tabs;
    this.state = state;
    this.collectionService = collectionService;
    this.environment = environment;
  }

  // ================= COLLECTIONS =================
  setCollections(cols = []) {
    this.state.collections = cols;
  }

  // ================= BODY NORMALIZER =================
  normalizeBody(body) {

    if (!body)
      return null;

    // old format
    if (typeof body === "string")
      return body;

    // new format
    if (
      typeof body === "object"
    ) {

      if (
        body.mode === "raw"
      ) {
        return body.raw || "";
      }

      return JSON.stringify(
        body
      );
    }

    return null;
  }

  // ================= LOAD =================
  async loadCollection(collectionId) {

  const col =
    this.state.collections.find(
      c => Number(c.id) === Number(collectionId)
    );

  if (!col) return null;

  this.state.activeCollectionId = col.id;

  try {

    const res = await fetch(
      `${API_BASE_URL}/requests/collection/${col.id}`,
      {
        method: "GET",
        headers: this.collectionService.headers()
      }
    );

    if (!res.ok) {
      console.error(await res.text());
      return null;
    }

    const rows = await res.json();

    // ================= IMPORTANT =================
    // ❌ NO CLOSED FILTER HERE (sidebar must show ALL)

    const safeTabs = (rows || []).map(r => ({

      id: Number(r.id),

      workspace_id: r.workspace_id,
      collection_id: r.collection_id,

      name: r.name || "Untitled",
      method: r.method || "GET",
      url: r.url || "",

      body: {
        mode: "raw",
        raw: r.body || "",
        formData: [],
        urlencoded: []
      },

      pinned: !!r.pinned,

      headers: {},
      params: {},

      auth: {
        type: r.auth_type || "",
        value: r.auth_value || ""
      },

      scripts: {
        pre: r.pre_script || "",
        post: r.post_script || ""
      },

      opened: true,
      history: []

    }));

    col.tabs = structuredClone(safeTabs);

    this.tabs.tabs = structuredClone(safeTabs);

    this.tabs.activeId =
      col.activeTabId
      || safeTabs[0]?.id
      || null;

    this.tabs.render();
    this.tabs.syncForm();

    return col;

  } catch (err) {
    console.error("[LOAD COLLECTION ERROR]", err);
    return null;
  }
}
  // ================= SAVE =================
  async saveActiveCollection() {

    const collectionId =
      this.state.activeCollectionId;

    if (!collectionId)
      return;

    const tabs =
      this.tabs.tabs || [];

    try {

      for (
        const tab of tabs
      ) {

        if (!tab.id)
          continue;

        const payload = {

          name:
            tab.name
            || "Untitled",

          method:
            tab.method
            || "GET",

          url:
            tab.url
            || "",

          body:
            this.normalizeBody(
              tab.body
            ),

          pinned:
            tab.pinned
              ? 1
              : 0,

          auth_type:
            tab.auth?.type
            || null,

          auth_value:
            tab.auth?.value
            || null,

          pre_script:
            tab.scripts?.pre
            || null,

          post_script:
            tab.scripts?.post
            || null,

          sort_order: 0

        };

        const res =
          await fetch(
            `${API_BASE_URL}/requests/${tab.id}`,
            {
              method: "PUT",

              headers:
                this.collectionService.headers(),

              body:
                JSON.stringify(
                  payload
                )
            }
          );

        if (!res.ok) {

          console.warn(
            "[UPDATE TAB FAILED]",
            await res.text()
          );

        }

      }

      const col =
        this.state.collections.find(
          c =>
            Number(c.id)
            === Number(
              collectionId
            )
        );

      if (col) {

        col.tabs =
          structuredClone(
            tabs
          );

        col.activeTabId =
          this.tabs.activeId;

      }

    }
    catch (err) {

      console.error(
        "[SAVE FAILED]",
        err
      );

    }
  }

  // ================= ADD =================
  async addTabToActiveCollection() {

    const collectionId =
      this.state.activeCollectionId;

    if (!collectionId)
      return;

    const col =
      this.state.collections.find(
        c =>
          Number(c.id)
          === Number(
            collectionId
          )
      );

    try {

      const res =
        await fetch(
          `${API_BASE_URL}/requests`,
          {
            method: "POST",

            headers:
              this.collectionService.headers(),

            body:
              JSON.stringify({

              workspace_id:
                col.workspace_id,

              collection_id:
                collectionId,

              name:
                "New Request",

              method:
                "GET",

              url: "",

              body: "",

              pinned: 0,

              sort_order: 0

            })
          }
        );

      if (!res.ok) {

        console.error(
          "[CREATE FAILED]",
          await res.text()
        );

        return;
      }

      const req =
        await res.json();

      await this.loadCollection(
        collectionId
      );

      if (req?.id) {

        this.tabs.setActive(
          req.id
        );

      }

    }
    catch (err) {

      console.error(
        "[ADD TAB FAILED]",
        err
      );

    }
  }

renderCollections(container) {

  if (!container) return;

  container.innerHTML = "";

  this.state.collections
    .forEach(col => {

    const wrap =
      document.createElement(
        "div"
      );

    const header =
      document.createElement(
        "div"
      );

    header.className =
      "collection";

    header.textContent =
      col.name;

    // ================= OPEN =================
    header.onclick =
      async () => {

      await this.saveActiveCollection();

      await this.loadCollection(
        col.id
      );

      this.renderCollections(
        container
      );

    };

    // ================= CONTEXT MENU =================
    header.oncontextmenu =
      (e) => {

      e.preventDefault();

      let menu =
        document.getElementById(
          "collectionContextMenu"
        );

      if (!menu) {

        menu =
          document.createElement(
            "div"
          );

        menu.id =
          "collectionContextMenu";

        menu.style.position =
          "fixed";

        menu.style.background =
          "#1e1e1e";

        menu.style.border =
          "1px solid #333";

        menu.style.borderRadius =
          "8px";

        menu.style.minWidth =
          "180px";

        menu.style.zIndex =
          "999999";

        menu.style.display =
          "none";

        document.body
          .appendChild(
            menu
          );

      }

      menu.innerHTML = "";


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

  menu.style.display=
    "none";

  const newName=
    prompt(
      "Collection name",
      col.name
    );

  if(
    !newName?.trim()
  ) return;

  try{

    await this
      .collectionService
      .update(
        col.id,
        {
          name:
            newName.trim()
        }
      );

    col.name=
      newName.trim();

    this.renderCollections(
      container
    );

  }
  catch(err){

    console.error(
      "[RENAME COLLECTION]",
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
        async () => {

        menu.style.display =
          "none";

        try {

          await this.collectionService
            .delete(
              col.id
            );

          this.state.collections =
            this.state.collections
            .filter(
              c =>
                Number(c.id)
                !== Number(
                  col.id
                )
            );

          if (
            Number(
              this.state
              .activeCollectionId
            )
            === Number(
              col.id
            )
          ) {

            this.state
              .activeCollectionId =
                null;

          }

          this.renderCollections(
            container
          );

        }
        catch(err){

          console.error(
            "[DELETE COLLECTION]",
            err
          );

        }

      };

      // ================= EXPORT =================
      const exportPostman =
        document.createElement(
          "div"
        );

      exportPostman.textContent =
        "Export Postman";

      exportPostman.style.padding =
        "10px";

      exportPostman.style.cursor =
        "pointer";

      exportPostman.onclick =
        () => {

        menu.style.display =
          "none";

        this.exportCollectionAsPostman(col.id);

      };

      menu.appendChild(
        rename
      );

      menu.appendChild(
        del
      );

      menu.appendChild(
        exportPostman
      );

      menu.style.left =
        `${e.clientX}px`;

      menu.style.top =
        `${e.clientY}px`;

      menu.style.display =
        "block";

    };

    wrap.appendChild(
      header
    );

    // ================= REQUEST LIST =================
    if (col.tabs?.length) {

      const reqWrap =
        document.createElement(
          "div"
        );

      reqWrap.style.marginLeft =
        "16px";

      col.tabs.forEach(tab => {

        const item =
          document.createElement(
            "div"
          );

        item.className =
          "collection-request";

        item.textContent =
          `${tab.method || "GET"} ${tab.name}`;

        item.onclick = async (e) => {

          e.stopPropagation();

          // 1. reload collection
          await this.loadCollection(col.id);

          // 2. UN-CLOSE TAB (IMPORTANT)
          const closed =
            JSON.parse(localStorage.getItem("closed_tabs") || "[]");

          const index = closed.indexOf(Number(tab.id));
          if (index !== -1) {
            closed.splice(index, 1);
            localStorage.setItem("closed_tabs", JSON.stringify(closed));
          }

          // 3. sync UI state
          this.tabs.closedTabIds?.delete(Number(tab.id));

          // 4. ensure tab exists in UI list
          const exists = this.tabs.tabs.find(t => t.id === tab.id);

          if (!exists) {
            const original = col.tabs.find(t => t.id === tab.id);
            if (original) {
              this.tabs.tabs.push(structuredClone(original));
            }
          }

          // 5. activate tab
          this.setActiveTab(tab.id);

          // 6. re-render
          this.tabs.render();
          this.tabs.syncForm();
        };


        item.oncontextmenu =
          (e)=>{

          e.preventDefault();

          window.__openTabMenu?.(
            e,
            tab
          );

        };


        reqWrap.appendChild(
          item
        );

      });

      wrap.appendChild(
        reqWrap
      );

    }

    container.appendChild(
      wrap );

  });

  document.onclick =
    () => {

    const menu =
      document.getElementById(
        "collectionContextMenu"
      );

    if (menu) {

      menu.style.display =
        "none";

    }

  };

}
  // ================= ACTIVE =================
  setActiveTab(id) {

    this.tabs.setActive?.(
      id
    );

    this.tabs.render?.();

    this.tabs.syncForm?.();

  }

  // ================= TAB ACTIONS =================

async renameTab(tab) {

  const newName =
    prompt("Request name", tab.name);

  if (!newName?.trim()) return;

  const name = newName.trim();

  try {

    const active =
      this.tabs.tabs.find(
        t => Number(t.id) === Number(tab.id)
      );

    if (!active) return;

    // update local dulu
    active.name = name;

    this.state.collections.forEach(col => {
      col.tabs?.forEach(t => {
        if (Number(t.id) === Number(tab.id)) {
          t.name = name;
        }
      });
    });

    // 🔥 IMPORTANT: pakai STRUCTURE FULL MATCH BACKEND
    const payload = {
      name,
      method: active.method || "GET",
      url: active.url || "",
      body: this.normalizeBody(active.body),
      pinned: active.pinned ? 1 : 0,
      auth_type: active.auth?.type || null,
      auth_value: active.auth?.value || null,
      pre_script: active.scripts?.pre || null,
      post_script: active.scripts?.post || null,
      sort_order: active.sort_order ?? 0
    };

    const res = await fetch(
      `${API_BASE_URL}/requests/${tab.id}`,
      {
        method: "PUT",
        headers: this.collectionService.headers(),
        body: JSON.stringify(payload)
      }
    );

    if (!res.ok) {
      console.error(await res.text());
      return;
    }

    // ❗ IMPORTANT: reload dari backend supaya pasti konsisten
    await this.loadCollection(this.state.activeCollectionId);

    this.tabs.render();
    this.renderCollections(
      document.getElementById("collectionList")
    );

    window.scheduleSave?.();

  } catch (err) {
    console.error("[RENAME TAB]", err);
  }
}


async deleteTab(tab) {

  try {

    await fetch(
      `${API_BASE_URL}/requests/${tab.id}`,
      {
        method:"DELETE",

        headers:
          this.collectionService
            .headers()
      }
    );

    this.tabs.tabs =
      this.tabs.tabs.filter(
        t =>
          Number(t.id)
          !== Number(
            tab.id
          )
      );

    if (
      this.tabs.activeId
      === tab.id
    ) {

      this.tabs.activeId =
        this.tabs.tabs[0]
          ?.id
        || null;

    }

    this.tabs.render();

    this.tabs.syncForm();

    await this.saveActiveCollection();

  }
  catch(err){

    console.error(
      "[DELETE TAB]",
      err
    );

  }

}


async duplicateTab(tab) {

  try {

    const res =
      await fetch(
        `${API_BASE_URL}/requests`,
        {
          method:"POST",

          headers:
            this.collectionService
              .headers(),

          body:
            JSON.stringify({

            workspace_id:
              tab.workspace_id,

            collection_id:
              tab.collection_id,

            name:
              `${tab.name} copy`,

            method:
              tab.method,

            url:
              tab.url,

            body:
              this.normalizeBody(
                tab.body
              ),

            pinned:0,

            sort_order:0

          })
        }
      );

    const req =
      await res.json();

    await this.loadCollection(
      tab.collection_id
    );

    if(req?.id){

      this.tabs.setActive(
        req.id
      );

    }

    await this.saveActiveCollection();

  }
  catch(err){

    console.error(
      "[DUP TAB]",
      err
    );

  }

}


async togglePinTab(tab){

  tab.pinned =
    !tab.pinned;

  await this.saveActiveCollection();

  this.tabs.render();

}


closeTab(tabId) {

  const id = Number(tabId);

  // 🔥 ALWAYS use Tabs system
  this.tabs.close?.(id);

  // optional sync localStorage (if still needed)
  const closed =
    JSON.parse(localStorage.getItem("closed_tabs") || "[]");

  if (!closed.includes(id)) {
    closed.push(id);
    localStorage.setItem("closed_tabs", JSON.stringify(closed));
  }

  // switch active
  if (this.tabs.activeId === id) {

    const next =
      this.tabs.tabs.find(
        t => !this.tabs.closedTabIds.has(Number(t.id))
      );

    this.tabs.activeId = next?.id || null;
  }

  this.tabs.render();
  this.tabs.syncForm?.();
}



  // ================= EXPORT POSTMAN =================
exportCollectionAsPostman(
  collectionId
) {

  const collection =
    this.state.collections
      .find(
        c =>
          Number(c.id)
          === Number(
            collectionId
          )
      );

  if (!collection)
    return;

  const tabs =
    collection.tabs
    || [];

  const payload = {

    id:
      collection.id,

    name:
      collection.name,

    tabs:
      tabs.map(
        tab => ({

        name:
          tab.name,

        method:
          tab.method
          || "GET",

        url:
          tab.url
          || "",

        body:
          tab.body?.raw
          || "",

        headers:
          tab.headers
          || {},

        auth:
          tab.auth
          || {}

      }))
  };

  const postman =
    exportPostmanCollection(
      payload
    );

  const blob =
    new Blob(
      [
        JSON.stringify(
          postman,
          null,
          2
        )
      ],
      {
        type:
          "application/json"
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const a =
    document.createElement(
      "a"
    );

  a.href = url;

  a.download =
    `${collection.name}.postman_collection.json`;

  a.click();

  URL.revokeObjectURL(
    url
  );

}

}