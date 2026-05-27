import { API_BASE_URL } from "../../core/api/api-config.js";
import { exportPostmanCollection } from "../../core/exporters/postman-exporter.js";

export class CollabTabsController {
  constructor({ tabs, state, collectionService, environment }) {
    this.tabs = tabs;
    this.state = state;
    this.collectionService = collectionService;
    this.environment = environment;
    this.lastMutation = 0;
  }

  // ================= WEBSOCKET HANDLER =================
  handleSocketMessage(payload) {
    const { type, workspace_id, request_id, data } = payload;
    if (workspace_id !== this.state.activeCollection?.workspace_id) return;

    switch (type) {
      case 'REQUEST_CREATED':
        this.tabs.tabs.push(data);
        this.tabs.render();
        break;
      case 'REQUEST_UPDATED':
        const tab = this.tabs.tabs.find(t => Number(t.id) === Number(data.id));
        if (tab) {
          Object.assign(tab, data);
          this.tabs.render();
          this.tabs.syncForm();
        }
        break;
      case 'REQUEST_DELETED':
        this.tabs.tabs = this.tabs.tabs.filter(t => Number(t.id) !== Number(request_id));
        if (this.tabs.activeId === Number(request_id)) {
            this.tabs.activeId = this.tabs.tabs[0]?.id || null;
        }
        this.tabs.render();
        break;
    }
  }

  // ================= LOAD & CORE =================
  async loadCollection(collectionId) {
    const col = this.state.collections.find(c => Number(c.id) === Number(collectionId));
    if (!col) return null;

    try {
      const res = await fetch(`${API_BASE_URL}/requests/collection/${col.id}`, {
        method: "GET",
        headers: this.collectionService.headers()
      });

      if (!res.ok) return null;
      const rows = await res.json();
      
      col.tabs = rows.map(r => ({ ...r, id: Number(r.id), opened: true }));
      this.state.activeCollection = col;
      this.state.activeCollectionId = col.id;
      
      this.tabs.tabs = structuredClone(col.tabs);
      this.tabs.render();
      this.tabs.syncForm();
      return col;
    } catch (err) {
      console.error("[LOAD COLLECTION ERROR]", err);
      return null;
    }
  }

  // ================= TAB ACTIONS =================
  async deleteTab(tab) {
    try {
      await fetch(`${API_BASE_URL}/requests/${tab.id}`, {
        method: "DELETE",
        headers: this.collectionService.headers()
      });
      // Tidak perlu loadCollection lagi, biarkan WebSocket yg handle update UI
    } catch(err) { console.error("[DELETE TAB]", err); }
  }

  async renameTab(tab) {
    const newName = prompt("Request name", tab.name);
    if (!newName?.trim()) return;
    
    try {
      await fetch(`${API_BASE_URL}/requests/${tab.id}`, {
        method: "PUT",
        headers: this.collectionService.headers(),
        body: JSON.stringify({ ...tab, name: newName.trim() })
      });
    } catch (err) { console.error("[RENAME TAB]", err); }
  }

  async saveActiveCollection() {
    // Digunakan untuk save manual (jika perlu)
    const tabs = this.tabs.tabs || [];
    for (const tab of tabs) {
      await fetch(`${API_BASE_URL}/requests/${tab.id}`, {
        method: "PUT",
        headers: this.collectionService.headers(),
        body: JSON.stringify(tab)
      });
    }
  }

  // ================= EXPORT POSTMAN =================
  exportCollectionAsPostman(collectionId) {
    const collection = this.state.collections.find(c => Number(c.id) === Number(collectionId));
    if (!collection) return;

    const payload = {
      id: collection.id,
      name: collection.name,
      tabs: (collection.tabs || []).map(tab => ({
        name: tab.name,
        method: tab.method || "GET",
        url: tab.url || "",
        body: tab.body?.raw || "",
        headers: tab.headers || {},
        auth: tab.auth || {}
      }))
    };

    const postman = exportPostmanCollection(payload);
    const blob = new Blob([JSON.stringify(postman, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${collection.name}.postman_collection.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // (Method renderCollections lainnya bisa kamu biarkan sesuai aslimu)
}