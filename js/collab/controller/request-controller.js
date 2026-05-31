//request-controller.js

import { RequestService } from "../request-service.js";
import { RequestUI } from "../ui/request-ui.js"; 

export class RequestController {
    constructor(ui, State, { onUpdateUI, tabCtrl }) {
        this.ui = ui; // Container untuk request di sidebar/folder
        this.State = State;
        this.onUpdateUI = onUpdateUI;
        this.tabCtrl = tabCtrl;
        
        // BroadcastChannel untuk sinkronisasi antar tab
        this.bc = new BroadcastChannel('request_channel');
        this.setupBroadcastListener();

        // Socket listener dari pusat (collab-app.js)
        window.addEventListener("socket:message", (e) => {
            const payload = e.detail;
            if (payload.type && payload.type.startsWith('REQUEST_')) {
                this.handleSocketMessage(payload);
            }
        });


        this.handlers = {
            onRename: (id, newName) => this.renameRequest(id, newName),
            onDuplicate: (req) => console.log("Duplicating...", req),
            onPin: (id, pinned) => this.updateRequest(id, { pinned }),
            onDelete: (id) => this.deleteRequest(id)
        };
    }

    async init(workspaceId) {
        console.log("DEBUG: Mengambil request untuk workspace:", workspaceId);
        
        // Pastikan kita menunggu data koleksi jika belum ada
        // Anda mungkin perlu memanggil fungsi fetch collections jika masih kosong
        const collections = this.State.collections || [];
        
        if (collections.length === 0) {
            console.warn("DEBUG: Koleksi masih kosong, mencoba ambil dari service...");
            // Jika Anda punya akses ke service koleksi, panggil di sini
            // await CollectionService.getAll(workspaceId); 
        }
    
        // Gunakan Promise.all agar fetch berjalan paralel (lebih cepat)
        const promises = collections.map(col => RequestService.getByCollection(col.id));
        
        try {
            const results = await Promise.all(promises);
            // Gabungkan semua hasil array
            const allRequests = results.flat(); 
            
            this.State.requests = allRequests;
            if (this.onUpdateUI) {
                this.onUpdateUI(allRequests);
            }
            console.log("DEBUG: Total request terkumpul:", allRequests.length);
        } catch (err) {
            console.error("DEBUG: Gagal mengumpulkan request:", err);
        }
    }

    setupBroadcastListener() {
        this.bc.onmessage = (event) => {
            console.log("[DEBUG BROADCAST REQUEST] Menerima event:", event.data);
            this.handleSocketMessage(event.data);
        };
    }


    // Di dalam RequestController class
    updateUIElements(requestId, updatedData) {
        // 1. Update Sidebar Item
        const itemEl = document.querySelector(`.request-item[data-id="${requestId}"]`);
        if (itemEl) {
            // Jika data mengandung 'name', update teksnya
            if (updatedData.name) {
                const nameEl = itemEl.querySelector('.name');
                if (nameEl) nameEl.textContent = updatedData.name;
            }
            // Jika nanti ada perubahan 'method', bisa update badge-nya di sini
            if (updatedData.method) {
                const methodEl = itemEl.querySelector('.method-badge');
                if (methodEl) {
                    methodEl.className = `method-badge ${updatedData.method}`;
                    methodEl.textContent = updatedData.method;
                }
            }
        }

        // 2. Update Tab Item
        const tabEl = document.querySelector(`.tab-item[data-id="${requestId}"]`);
        if (tabEl) {
            if (updatedData.name) {
                const spanEl = tabEl.querySelector('span');
                if (spanEl) spanEl.textContent = updatedData.name;
            }
        }
    }

    getRequestById(id) {
        return this.State.requests.find(r => r.id === id);
    }

    handleSocketMessage(payload) {
        const { type, data } = payload;
        const request_id = payload.request_id || data?.id;

        console.log(`[REQUEST] Processing ${type}...`);

        switch (type) {
            case 'REQUEST_CREATED':
            if (!this.State.requests.find(r => r.id === data.id)) {
                this.State.requests.push(data);
                
                // JANGAN panggil loadRequestsByCollection kalau itu akan merender ulang semua.
                // Cukup panggil render() untuk root, atau panggil folder render untuk folder.
                if (data.folder_id) {
                    // Biarkan FolderController yang handle jika ada folder_id
                    if (window.folderCtrl) {
                        const folderEl = document.querySelector(`.folder-item[data-id="${data.folder_id}"]`);
                        if (folderEl) window.folderCtrl.renderFolder(data.folder_id, folderEl);
                    }
                } else {
                    // Jika root, cukup render() yang sudah kita buat sebelumnya
                    this.render();
                }
            }
            break;

           case 'REQUEST_DELETED':
                // 1. Update state
                this.State.requests = this.State.requests.filter(r => r.id !== request_id);
                
                // 2. Hapus dari Sidebar UI (DOM)
                const sidebarEl = document.querySelector(`.request-item[data-id="${request_id}"]`);
                if (sidebarEl) sidebarEl.remove();

                // 3. Hapus dari Tab UI (DOM) jika sedang terbuka
                // Kita panggil fungsi tabCtrl yang sudah ada untuk sinkronisasi
                if (this.tabCtrl) {
                    this.tabCtrl.closeTab(request_id); 
                }
                break;

            case 'REQUEST_UPDATED':
                const idx = this.State.requests.findIndex(r => r.id === data.id);
                if (idx !== -1) {
                    // Update state lokal
                    this.State.requests[idx] = { ...this.State.requests[idx], ...data };
                    
                    // Panggil helper untuk update UI secara dinamis
                    this.updateUIElements(data.id, data);

                    if (this.tabCtrl) this.tabCtrl.updateTab(data.id, data);
                }
                break;
        }
    }



    async render() {
        // 1. Bersihkan HANYA container utama (root level)
        // Gunakan selector yang spesifik agar tidak menyentuh container di dalam folder

        // 2. Loop semua request dan filter hanya yang folder_id-nya null (root)
        this.State.requests.forEach(req => {
            // PERBAIKAN LOGIKA: Hanya render jika folder_id benar-benar null atau undefined
            if (!req.folder_id) {
                
                // Cari container berdasarkan data-collection-id
                const mainContainer = document.querySelector(`[data-collection-id="${req.collection_id}"] .requests-list`);
                
                if (mainContainer) {
                    // Render item request ke root
                    RequestUI.renderRequestItem(
                        req, 
                        mainContainer, 
                        this.handlers, 
                        (r) => this.tabCtrl.openTab(r)
                    );
                } else {
                    const rootContainers = document.querySelectorAll('.requests-list');
                    rootContainers.forEach(container => {
                        container.innerHTML = '';
                    });
                    console.warn(`[DEBUG] Container koleksi ${req.collection_id} tidak ditemukan.`);
                }
            }
            // Jika req.folder_id ada nilainya, biarkan FolderController yang bekerja!
        });
        
        console.log(`[DEBUG] Render selesai. Total request root: ${this.State.requests.filter(r => !r.folder_id).length}`);
    }



    async loadRequestsByCollection(collectionId, folderId = null) {
        try {
            const newRequests = await RequestService.getByCollection(collectionId, folderId);
            
        
            // 1. SMART MERGE: Jangan timpa seluruh State
            // Hapus request lama yang berada di collection/folder yang sama, lalu masukkan yang baru
            this.State.requests = this.State.requests.filter(r => 
                !(String(r.collection_id) === String(collectionId) && String(r.folder_id || null) === String(folderId))
            );

            const existingIds = new Set(this.State.requests.map(r => r.id));
        
            // 3. Hanya masukkan request yang BELUM ada di state
            const uniqueNewRequests = newRequests.filter(r => !existingIds.has(r.id));

            this.State.requests.push(...uniqueNewRequests);
            // 2. SMART TARGETING: Cari container berdasarkan folder/koleksi
            // Jangan pakai ID statis yang kaku, gunakan selector yang dinamis
            const container = folderId 
                ? document.querySelector(`.folder-item[data-id="${folderId}"] > .child-list`)
                : document.querySelector(`[data-collection-id="${collectionId}"] .requests-list`);
    
            if (container) {
                container.innerHTML = ""; // Bersihkan hanya container yang spesifik ini
                newRequests.forEach(req => 
                    RequestUI.renderRequestItem(
                        req, 
                        container, 
                        this.handlers, 
                        (r) => this.tabCtrl.openTab(r)
                    )
                );
            }
        } catch (err) {
            console.error("Gagal load requests:", err);
        }
    }


    async renameRequest(id, newName) {
        const request = this.State.requests.find(r => r.id === id);
        if (!request) return;
    
        // Perhatikan ini: Kita langsung set name ke string, BUKAN ke objek {name: newName}
        const payload = {
            ...request,
            name: newName // Ini sudah benar, ini akan menimpa field name yang lama
        };
        
        await this.updateRequest(id, payload);
    }


    // --- CRUD ACTIONS ---

    async createRequest(context) {
    try {
        const newReq = await RequestService.create({
            ...context,
            name: "New Request",
            method: "GET"
        });

        // 1. Update State lokal
        console.log("apa isi is context folder_id?: ", context.folder_id);
        // 2. SMART UI UPDATE:
        if (context.folder_id) {
            // Jika ada folder_id, minta FolderController render ulang folder tsb
            if (window.folderCtrl) {
               // if (this.onUpdateUI) this.onUpdateUI(this.State.requests);
                const folderEl = document.querySelector(`.folder-item[data-id="${context.folder_id}"]`);
                if (folderEl) window.folderCtrl.renderFolder(context.folder_id, folderEl);
               
            }
        } else {
            // Jika folder_id null/undefined, kita di Root (di luar folder)
            // Cukup panggil render() milik RequestController
            const isExists = this.State.requests.find(r => r.id === newReq.id);
            if (!isExists) {
                this.State.requests.push(newReq);
                if (this.onUpdateUI) this.onUpdateUI(this.State.requests);
            }
    
            //this.render(); 
        }

        // 3. Broadcast & Tab
        this.bc.postMessage({ type: 'REQUEST_CREATED', data: newReq });
        if (this.tabCtrl) this.tabCtrl.openTab(newReq);
            
        return newReq;
    } catch (err) {
        console.error("Gagal buat request:", err);
        alert("Gagal membuat request");
    }
}

    async deleteRequest(id) {
        if (!confirm("Are you sure you want to delete this request?")) return;

        try {
            await RequestService.delete(id);

            // Broadcast
            this.bc.postMessage({ type: 'REQUEST_DELETED', request_id: id });

            // Update State
            this.State.requests = this.State.requests.filter(r => r.id !== id);
        } catch (err) {
            //console.error("Gagal delete request:", err);
            alert("Gagal menghapus request");
        }
    }

    async updateRequest(id, payload) {
        try {
            const updatedReq = await RequestService.update(id, payload);
            
            // Broadcast data terbaru dari server
            this.bc.postMessage({ type: 'REQUEST_UPDATED', data: updatedReq });
    
            // Update State dengan Merge (Data lama + Update dari server)
            const idx = this.State.requests.findIndex(r => r.id === id);
            if (idx !== -1) {
                this.State.requests[idx] = { ...this.State.requests[idx], ...updatedReq };
            }

            console.log(`[SYNC] Field ${Object.keys(payload)} berhasil disimpan.`);
        } catch (err) {
            console.error("Gagal update request:", err);
        }
    }



    async updateRequestFull(id) {
        // 1. Ambil data lama dari State
        const oldData = this.getRequestById(id);
        if (!oldData) {
            console.error(`[ERROR] Request dengan ID ${id} tidak ditemukan di State!`);
            return;
        }
    
        // 2. Buat payload lengkap: 
        // Ambil semua properti lama, lalu timpa dengan nilai baru dari DOM
        const payload = {
            ...oldData, // Mengambil semua field: workspace_id, folder_id, collection_id, dll
            name: document.getElementById('name')?.value || oldData.name,
            method: document.getElementById('method')?.value,
            url: document.getElementById('url')?.value,
            body: document.getElementById('body')?.value,
            auth_type: document.getElementById('authType')?.value,
            auth_value: document.getElementById('authValue')?.value
        };
    
        try {
            console.log(`[SYNC] Full update untuk request ${id}:`, payload);
            
            // 3. Kirim payload lengkap ke service
            const updatedReq = await RequestService.update(id, payload);
            
            // 4. Update State Lokal
            const idx = this.State.requests.findIndex(r => r.id === id);
            if (idx !== -1) {
                // Kita merge state lama + hasil response server
                this.State.requests[idx] = { ...this.State.requests[idx], ...updatedReq };
            }
    
            // 5. Broadcast perubahan
            this.bc.postMessage({ type: 'REQUEST_UPDATED', data: updatedReq });
            
        } catch (err) {
            console.error("Gagal update full request:", err);
            alert("Gagal menyimpan perubahan.");
        }
    }

}