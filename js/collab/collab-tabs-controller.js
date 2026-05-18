import { API_BASE_URL } from "../core/api/api-config.js";

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
  async loadCollection(
    collectionId
  ) {

    const col =
      this.state.collections.find(
        c =>
          Number(c.id)
          === Number(
            collectionId
          )
      );

    if (!col)
      return null;

    this.state.activeCollectionId =
      col.id;

    try {

      const res =
        await fetch(
          `${API_BASE_URL}/requests/collection/${col.id}`,
          {
            method: "GET",

            headers:
              this.collectionService.headers()
          }
        );

      if (!res.ok) {

        console.error(
          "[LOAD REQUEST FAILED]",
          await res.text()
        );

        return null;
      }

      const rows =
        await res.json();

      const safeTabs =
        (rows || []).map(
          r => ({

          id: r.id,

          workspace_id:
            r.workspace_id,

          collection_id:
            r.collection_id,

          name:
            r.name
            || "Untitled",

          method:
            r.method
            || "GET",

          url:
            r.url
            || "",

          body: {
            mode: "raw",

            raw:
              r.body
              || "",

            formData: [],

            urlencoded: []
          },

          pinned:
            !!r.pinned,

          headers: {},

          params: {},

          auth: {

            type:
              r.auth_type
              || "",

            value:
              r.auth_value
              || ""

          },

          scripts: {

            pre:
              r.pre_script
              || "",

            post:
              r.post_script
              || ""

          },

          opened: true,

          history: []

        }));

      col.tabs =
        structuredClone(
          safeTabs
        );

      this.tabs.tabs =
        structuredClone(
          safeTabs
        );

      this.tabs.activeId =
        col.activeTabId
        || safeTabs[0]?.id
        || null;

      this.tabs.render();

      this.tabs.syncForm();

      return col;

    }
    catch (err) {

      console.error(
        "[LOAD COLLECTION ERROR]",
        err
      );

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

  renderCollections(container){

  if(!container) return;

  container.innerHTML = "";

  this.state.collections.forEach(col=>{

    const div =
      document.createElement("div");

    div.className =
      "collection-item";

    div.textContent =
      col.name;

    div.onclick = async()=>{

      await this.saveActiveCollection();

      await this.loadCollection(
        col.id
      );

    };

    container.appendChild(div);

  });

}
  // ================= ACTIVE =================
  setActiveTab(id) {

    this.tabs.setActive?.(
      id
    );

    this.tabs.render?.();

    this.tabs.syncForm?.();

  }

}