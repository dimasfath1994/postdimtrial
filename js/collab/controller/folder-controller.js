import { FolderService } from "../folder-service.js";
import { renderFolderChildren, showFolderContextMenu } from "../ui/folder-ui.js";

export class FolderController {
    constructor(ui, State, { onUpdateUI, workspaceId, collectionId }) {
        this.ui = ui;
        this.State = State;
        this.onUpdateUI = onUpdateUI;
        this.workspaceId = workspaceId;
        this.collectionId = collectionId;
        
         // BroadcastChannel untuk sinkronisasi antar tab
        this.bc = new BroadcastChannel('folder_channel');
        this.setupBroadcastListener();

        window.addEventListener("socket:message", (e) => {
            const payload = e.detail;
            if (payload.type && payload.type.startsWith('FOLDER_')) {
                this.handleSocketMessage(payload);
            }
        });
    }

    async init(collectionId) {
        this.collectionId = collectionId;
        const folders = await FolderService.getByCollection(collectionId);
        this.State.folders = folders;
        this.render(); 
    }

    setupBroadcastListener() {
        this.bc.onmessage = (event) => {
            this.handleSocketMessage(event.data);
        };
    }

    handleSocketMessage(payload) {
        const { type, data, folder_id } = payload;
        
        // 1. UPDATE STATE dengan proteksi
        switch (type) {
            case 'FOLDER_CREATED':
                if (!this.State.folders.find(f => f.id === data.id)) {
                    this.State.folders.push(data);
                }
                break;
            case 'FOLDER_DELETED':
                this.State.folders = this.State.folders.filter(f => f.id !== folder_id);
                const deletedEl = document.querySelector(`[data-id="${folder_id}"]`);
                if (deletedEl) deletedEl.remove();
                break;
            case 'FOLDER_UPDATED':
                const idx = this.State.folders.findIndex(f => f.id === data.id);
                if (idx !== -1) {
                    this.State.folders[idx] = { ...this.State.folders[idx], ...data };
                }
                break;
        }
    
        // 2. Render sidebar utama
        this.render();
    
        // 3. TARGETED RE-RENDER
        // Menggunakan requestAnimationFrame untuk mencegah race condition DOM
        requestAnimationFrame(() => {
            if (type === 'FOLDER_CREATED' || type === 'FOLDER_UPDATED') {
                const targetParentId = data.parent_id;
                
                // Jika parent_id null, targetkan container koleksi
                if (targetParentId === null) {
                    const colEl = document.querySelector(`[data-collection-id="${this.collectionId}"]`);
                    if (colEl) this.renderFolder(null, colEl);
                } else {
                    // Jika ada parent_id, targetkan folder parent tersebut
                    const parentEl = document.querySelector(`[data-id="${targetParentId}"]`);
                    if (parentEl) this.renderFolder(targetParentId, parentEl);
                }
            }
        });
    }

    renderFolder(folderId, parentElement) {
        // 1. Mencegah proses render ganda
        if (parentElement.getAttribute('data-rendering') === 'true') return;
        parentElement.setAttribute('data-rendering', 'true');
        
        console.log("DEBUG: Memulai render folderId:", folderId, "pada elemen:", parentElement);
    
        // 2. Filter folder dengan logika yang konsisten
        const subFolders = this.State.folders.filter(f => {
            const isTargetParent = (folderId === null) 
                ? (f.parent_id === null) 
                : (String(f.parent_id) === String(folderId));
                
            return isTargetParent && String(f.collection_id) === String(this.collectionId);
        });
    
        console.log(`[DEBUG] Rendering level: ${folderId}, Found: ${subFolders.length} folders.`);
    
        // 3. Panggil fungsi UI
        // Kita gunakan try-finally agar data-rendering selalu dihapus meski terjadi error
        try {
            renderFolderChildren(parentElement, subFolders, [], {
                onOpenMenu: (e, folder) => showFolderContextMenu(e, folder, {
                    onRename: (id) => { 
                        const name = prompt("New name:", folder.name); 
                        if (name) this.renameFolder(id, name); 
                    },
                    onDelete: (id) => this.deleteFolder(id),
                    onExpand: (id, el) => this.renderFolder(id, el),
                    onAddFolder: (parentId) => { 
                        const name = prompt("Folder name:"); 
                        if (name) {
                            const wsId = this.State.workspaceId;
                            this.createFolder(wsId, this.collectionId, parentId, name); 
                        } 
                    }
                }),
                onExpand: (id, el) => {
                    // Memastikan el adalah elemen yang benar-benar diklik
                    this.renderFolder(id, el);
                }
            });
        } catch (err) {
            console.error("DEBUG: Terjadi error saat render folder:", err);
        } finally {
            // 4. Lepaskan Lock (diletakkan di finally agar aman)
            parentElement.removeAttribute('data-rendering');
        }
    }

    async render() {
        if (this.onUpdateUI) this.onUpdateUI(this.State.folders);
    }

    async createFolder(workspaceId, collectionId, parentId, name) {
        // 1. Resolve collectionId dengan aman
        let targetCollectionId = collectionId;
        if (!targetCollectionId && parentId) {
            const parentFolder = this.State.folders.find(f => f.id == parentId);
            if (parentFolder) {
                targetCollectionId = parentFolder.collection_id;
            }
        }
    
        console.log(`[DEBUG] Creating folder: Name=${name}, Parent=${parentId}, Collection=${targetCollectionId}`);
    
        try {
            const newFolder = await FolderService.create(workspaceId, targetCollectionId, parentId, name);
            
            // 2. Broadcast ke tab lain
            this.bc.postMessage({ type: 'FOLDER_CREATED', data: newFolder });
            
            // 3. Update Local State
            this.State.folders.push(newFolder);
            
            // 4. Targeted UI Update
            if (parentId) {
                // Cari elemen parent berdasarkan dataset id
                const parentElement = document.querySelector(`.folder-item[data-id="${parentId}"]`);
                
                if (parentElement) {
                    // Hapus child-list lama agar sinkron dengan state baru
                    const oldList = parentElement.querySelector(':scope > .child-list');
                    if (oldList) oldList.remove();
                    
                    // Pastikan lock dilepas agar bisa dirender ulang
                    parentElement.removeAttribute('data-rendering');
                    
                    // Panggil renderFolder untuk parent spesifik ini
                    this.renderFolder(parentId, parentElement);
                }
            } else {
                // Jika root level, panggil render utama
                this.render();
            }
        } catch (error) {
            console.error("Gagal membuat folder:", error);
            throw error;
        }
    }

    async renameFolder(id, newName) {
        await FolderService.update(id, { name: newName });
        this.bc.postMessage({ type: 'FOLDER_UPDATED', data: { id, name: newName } });
        const idx = this.State.folders.findIndex(f => f.id === id);
        if (idx !== -1) {
            this.State.folders[idx].name = newName;
            this.render();
        }
    }

    async deleteFolder(id) {
        if (!confirm("Hapus folder ini?")) return;
        
        // Simpan info parent sebelum dihapus dari state
        const folder = this.State.folders.find(f => f.id === id);
        const parentId = folder ? folder.parent_id : null;
        
        await FolderService.delete(id);
        this.bc.postMessage({ type: 'FOLDER_DELETED', folder_id: id });
        this.State.folders = this.State.folders.filter(f => f.id !== id);
        
        // Cukup panggil render() saja. 
        // Jika perlu update DOM spesifik, jangan hapus element container-nya.
        this.render(); 
    }
}