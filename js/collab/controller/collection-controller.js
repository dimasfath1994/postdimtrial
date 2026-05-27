import { CollectionService } from "../collection-service.js";

export class CollectionController {
    constructor(ui, State, { onUpdateUI }) {
        this.ui = ui; // Mengacu pada elemen UI container sidebar
        this.State = State;
        this.onUpdateUI = onUpdateUI; // Callback untuk memicu render ke collection-ui
        
        // BroadcastChannel untuk sinkronisasi antar tab dalam satu browser
        this.bc = new BroadcastChannel('collection_channel');
        this.setupBroadcastListener();

        window.addEventListener("socket:message", (e) => {
            const payload = e.detail;
            // Filter: Hanya proses jika message terkait collection
            if (payload.type && payload.type.startsWith('COLLECTION_')) {
                this.handleSocketMessage(payload);
            }
        });
        window.addEventListener("workspace:changed", (event) => {
            const newWorkspaceId = event.detail.id;
            this.State.workspaceId = newWorkspaceId;
            this.init(newWorkspaceId); // Fetch koleksi baru untuk workspace baru
        });
    }

    async init(workspaceId) {
        try {
            // 1. Ambil data koleksi dari API
            const list = await CollectionService.getByWorkspace(workspaceId);
            // 2. Update state lokal
            this.State.collections = list;
            // 3. Render
            this.render();
        } catch (err) {
            console.error("Gagal init collections:", err);
        }
    }

    setupBroadcastListener() {
        this.bc.onmessage = (event) => {
            console.log("[DEBUG BROADCAST COLLECTION] Menerima event:", event.data);
            this.handleSocketMessage(event.data);
        };
    }

    /**
     * Entry point untuk semua perubahan data (WebSocket atau BroadcastChannel)
     * Mengikuti pola yang sama dengan WorkspaceController
     */
    handleSocketMessage(payload) {
        const { type, data } = payload;
        const collection_id = payload.collection_id || data.collection_id;
        console.log(`[COLLECTION] Processing ${type}...`);

        switch (type) {
            case 'COLLECTION_CREATED':
            // 1. Update State
            if (!this.State.collections.find(c => c.id === data.id)) {
                this.State.collections.push(data);
                // 2. RE-RENDER UI (Sangat penting!)
                this.render(); 
            }
            break;

            case 'COLLECTION_DELETED':
                // 1. Update State
                this.State.collections = this.State.collections.filter(c => c.id !== collection_id);
                // 2. RE-RENDER UI (Sangat penting!)
                this.render();
                break;
                
            case 'COLLECTION_UPDATED':
                const idx = this.State.collections.findIndex(c => c.id === data.id);
                if (idx !== -1) {
                    this.State.collections[idx] = { ...this.State.collections[idx], ...data };
                    this.render();
                }
                break;

            default:
                return; // Tidak ada perubahan, tidak perlu re-render
        }
        

    }

    // --- RENDER TRIGGER ---
    async render() {
        console.log("Rendering collections:", this.State.collections); // Debugging: Cek apakah ini muncul di console
        if (this.onUpdateUI) {
            this.onUpdateUI(this.State.collections);
        }
    }


    // Di dalam class CollectionController
showContextMenu(e, col) {
    // 1. Bersihkan menu lama jika ada
    const existingMenu = document.querySelector('.context-menu');
    if (existingMenu) existingMenu.remove();

    // 2. Buat elemen menu
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    Object.assign(menu.style, {
        position: 'fixed',
        left: `${e.clientX}px`,
        top: `${e.clientY}px`,
        background: '#252526',
        border: '1px solid #454545',
        padding: '5px 0',
        zIndex: '1000',
        cursor: 'pointer'
    });

    menu.innerHTML = `
        <div class="menu-item" id="ctx-rename" style="padding:8px 15px;">Rename</div>
        <div class="menu-item" id="ctx-export" style="padding:8px 15px;">Export Postman</div>
        <div class="menu-item" id="ctx-add-folder" style="padding:8px 15px;">Add Folder</div>
        <div class="menu-item" id="ctx-add-request" style="padding:8px 15px;">Add Request</div>
        <div class="menu-item" id="ctx-delete" style="padding:8px 15px; color:#f44336;">Delete</div>
    `;

    document.body.appendChild(menu);

    // 3. Event Handling (Menggunakan metode internal class ini)
    menu.querySelector('#ctx-rename').onclick = () => {
        const newName = prompt("Rename collection to:", col.name);
        if (newName && newName !== col.name) {
            this.renameCollection(col.id, newName);
        }
        menu.remove();
    };

    menu.querySelector('#ctx-delete').onclick = () => {
        this.deleteCollection(col.id);
        menu.remove();
    };

    menu.querySelector('#ctx-export').onclick = () => {
        this.exportPostman(col.id);
        menu.remove();
    };

    // Close on click outside
    document.addEventListener('click', () => menu.remove(), { once: true });
}



    // --- CRUD ACTIONS (API & BROADCAST) ---

    async createCollection(name) {
        if (!name) return;
        try {
            const newCol = await CollectionService.create(this.State.workspaceId, name);
            
            // Broadcast ke tab lain
            this.bc.postMessage({ type: 'COLLECTION_CREATED', data: newCol });
            
            // Update lokal
            this.State.collections.push(newCol);
            this.render();
        } catch (err) {
            console.error("Gagal buat koleksi:", err);
        }
    }

    async renameCollection(id, newName) {
        if (!newName) return;
        
        try {
            // 1. Update ke Backend
            await CollectionService.update(id, { name: newName });
            
            // 2. Broadcast ke tab lain agar UI mereka juga update
            this.bc.postMessage({ 
                type: 'COLLECTION_UPDATED', 
                data: { id, name: newName } 
            });
            
            // 3. Update State lokal agar UI langsung berubah tanpa refresh
            const idx = this.State.collections.findIndex(c => c.id === id);
            if (idx !== -1) {
                this.State.collections[idx].name = newName;
                this.render(); // Panggil render UI
            }
            
        } catch (err) {
            console.error("Gagal rename koleksi:", err);
            alert("Gagal melakukan rename");
        }
    }

    async deleteCollection(id) {
        if (!confirm("Are you sure you want to delete this collection?")) return;
    
        try {
            // 1. Panggil API backend (Axum)
            await CollectionService.delete(id);
    
            // 2. Broadcast ke tab lain
            this.bc.postMessage({ 
                type: 'COLLECTION_DELETED', 
                collection_id: id 
            });
    
            // 3. Update State Lokal & Render
            this.State.collections = this.State.collections.filter(c => c.id !== id);
            this.render();
        } catch (err) {
            console.error("Gagal delete koleksi:", err);
            alert("Gagal menghapus koleksi");
        }
    }

    // --- EXTENDED FEATURES (PLACEHOLDERS) ---

    async addRequest(collectionId) {
        console.log("Add Request to collection:", collectionId);
        // Implementasi integrasi API request di sini
    }

    async addFolder(collectionId) {
        console.log("Add Folder to collection:", collectionId);
        // Implementasi integrasi API folder di sini
    }

    async exportPostman(id) {
        console.log("Exporting collection to Postman:", id);
        // Implementasi logika export postman
    }
}


