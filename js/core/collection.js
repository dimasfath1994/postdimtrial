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
      requests: [],
      folders: []
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
  addRequest(collectionId, request, folderId = null) {
    const col = this.getCollection(collectionId);
    if (!col) return;

    const req = {
        id: Date.now(),
        name: request.name || "New Request",
        method: request.method || "GET",
        url: request.url || "",
        folderId: folderId // Simpan referensi folder
    };

    if (folderId) {
        // Cari folder secara rekursif dan push ke dalamnya
        console.log("Menambahkan ke FOLDER ID:", folderId);
        const findAndPush = (folders) => {
            for (let f of folders) {
                if (f.id === folderId) {
                    if (!f.requests) f.requests = [];
                    f.requests.push(req);
                    return true;
                }
                if (f.folders && findAndPush(f.folders)) return true;
            }
            return false;
        };
        findAndPush(col.folders);
    } else {
        // Jika tidak ada folderId, masukkan ke root collection
        //console.log("Menambahkan ke ROOT");
        col.requests.push(req);
    }

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

    // 1. Coba cari dan hapus di dalam folder secara rekursif
    const findAndRemove = (folders) => {
        for (let f of folders) {
            // Cek apakah ada request di folder ini
            if (f.requests) {
                const initialLength = f.requests.length;
                f.requests = f.requests.filter(r => r.id !== requestId);
                
                // Jika panjang array berkurang, berarti request ditemukan dan dihapus
                if (f.requests.length !== initialLength) {
                    return true; 
                }
            }
            
            // Lanjut ke sub-folder jika ada
            if (f.folders && findAndRemove(f.folders)) {
                return true;
            }
        }
        return false;
    };

    // Jalankan pencarian di folder
    const deletedInFolder = findAndRemove(col.folders);

    // 2. Jika tidak ditemukan/dihapus di folder, baru hapus di root
    // (Ini menjaga agar logika root tetap berjalan seperti sedia kala)
    if (!deletedInFolder) {
        col.requests = col.requests.filter(r => r.id !== requestId);
    }

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



// ---------------- FOLDER ----------------
// Di dalam class CollectionManager
addFolder(collectionId, name, parentFolderId = null) {
  const newFolder = {
      id: Date.now(),
      name: name,
      folders: [],
      requests: []
  };

  const col = this.getCollection(collectionId);
  if (!col) return null;

  if (!parentFolderId) {
      col.folders.push(newFolder);
  } else {
      // REKURSI: Mencari folder tujuan di level mana pun
      const findAndInsert = (folders) => {
          for (let f of folders) {
              if (f.id === parentFolderId) {
                  if (!f.folders) f.folders = [];
                  f.folders.push(newFolder);
                  return true;
              }
              if (f.folders && findAndInsert(f.folders)) return true;
          }
          return false;
      };
      findAndInsert(col.folders);
  }

  this.save();
  return newFolder;
}


renameFolder(collectionId, folderId, newName) {
  const col = this.getCollection(collectionId);
  if (!col) return;

  const findAndRename = (folders) => {
      for (let f of folders) {
          if (f.id === folderId) {
              f.name = newName;
              return true;
          }
          if (f.folders && findAndRename(f.folders)) return true;
      }
      return false;
  };

  findAndRename(col.folders);
  this.save();
}

deleteFolder(collectionId, folderId) {
  const col = this.getCollection(collectionId);
  if (!col) return;

  const removeRecursive = (folders) => {
      // Cari apakah ada folder yang mau dihapus di level ini
      const index = folders.findIndex(f => f.id === folderId);
      
      if (index !== -1) {
          folders.splice(index, 1); // Hapus folder tersebut
          return true;
      }

      // Kalau belum ketemu, cari di sub-folders
      for (let f of folders) {
          if (f.folders && removeRecursive(f.folders)) return true;
      }
      return false;
  };

  removeRecursive(col.folders);
  this.save();
}

    
}