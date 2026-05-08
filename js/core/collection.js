import { Storage } from "./storage.js";

export class CollectionManager {

  constructor() {
    this.workspace = {
      collections: []
    };

    this.load();

    if (this.workspace.collections.length === 0) {
      this.createCollection("Default");
    }
  }

    exportWorkspace() {
    return JSON.stringify(this.workspace, null, 2);
    }

    importWorkspace(jsonString) {
    try {
        const data = JSON.parse(jsonString);

        if (!data.collections) {
        throw new Error("Invalid workspace format");
        }

        this.workspace = data;
        this.save();

        return true;
    } catch (err) {
        console.error("Import failed:", err);
        return false;
    }
}

  // ---------------- COLLECTION ----------------
  createCollection(name = "New Collection") {
    const collection = {
      id: Date.now(),
      name,
      requests: []
    };

    this.workspace.collections.push(collection);
    this.save();
    return collection;
  }

  getCollections() {
    return this.workspace.collections;
  }

  getCollection(id) {
    return this.workspace.collections.find(c => c.id === id);
  }

  // ---------------- REQUEST ----------------
  addRequest(collectionId, request) {
    tabs.create();
    tabs.getActive().collectionId = collectionId;
    const col = this.getCollection(collectionId);
    if (!col) return;

    const req = {
      id: Date.now(),
      name: request.name || "New Request",
      method: request.method || "GET",
      url: request.url || "",
      body: request.body || ""
    };

    col.requests.push(req);
    this.save();

    return req;
  }
    getTabsByCollection(id) {
    return this.tabs.filter(t => t.collectionId === id);
    }

  getRequest(collectionId, requestId) {
    const col = this.getCollection(collectionId);
    if (!col) return null;

    return col.requests.find(r => r.id === requestId);
  }

  updateRequest(collectionId, requestId, data) {
    const col = this.getCollection(collectionId);
    if (!col) return;

    const req = col.requests.find(r => r.id === requestId);
    if (!req) return;

    Object.assign(req, data);
    this.save();
  }

  deleteRequest(collectionId, requestId) {
    const col = this.getCollection(collectionId);
    if (!col) return;

    col.requests = col.requests.filter(r => r.id !== requestId);
    this.save();
  }

  // ---------------- STORAGE ----------------
  save() {
    localStorage.setItem("postdim_workspace", JSON.stringify(this.workspace));
  }

  load() {
    const data = localStorage.getItem("postdim_workspace");

    if (data) {
      try {
        this.workspace = JSON.parse(data);
      } catch {
        this.workspace = { collections: [] };
      }
    }
  }

    clear() {
        this.workspace = { collections: [] };
        this.save();
    }

    renameCollection(id, name) {
    const col = this.getCollection(id);
    if (!col) return;

    col.name = name || "Untitled";
    this.save();
    }

    deleteCollection(id) {
    this.workspace.collections =
        this.workspace.collections.filter(c => c.id !== id);

    this.save();
    }
}