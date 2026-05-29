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
        // Request biasanya di-load via Collection atau Folder, 
        // tapi method ini bisa digunakan jika ada kebutuhan global
        this.render();
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

    handleSocketMessage(payload) {
        const { type, data } = payload;
        const request_id = payload.request_id || data?.id;

        console.log(`[REQUEST] Processing ${type}...`);

        switch (type) {
            case 'REQUEST_CREATED':
                if (!this.State.requests.find(r => r.id === data.id)) {
                    this.State.requests.push(data);
                    this.render();
                }
                break;

            case 'REQUEST_DELETED':
                this.State.requests = this.State.requests.filter(r => r.id !== request_id);
                this.render();
                break;

            case 'REQUEST_UPDATED':
                const idx = this.State.requests.findIndex(r => r.id === data.id);
                if (idx !== -1) {
                    // Update state lokal
                    this.State.requests[idx] = { ...this.State.requests[idx], ...data };
                    
                    // Panggil helper untuk update UI secara dinamis
                    this.updateUIElements(data.id, data);
                }
                break;
        }
    }

    async render() {
        if (this.onUpdateUI) {
            this.onUpdateUI(this.State.requests);
        }
    }



    async loadRequestsByCollection(collectionId, folderId = null) {
        try {
            const requests = await RequestService.getByCollection(collectionId, folderId);
            this.State.requests = requests;
            
            const container = document.getElementById(`requests-container-${collectionId}`);
            if (container) {
                container.innerHTML = ""; // Bersihkan
                requests.forEach(req => 
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
    
        // DEBUG: Cek isi payload sebelum dikirim
        console.log("DEBUG: Final Payload yang dikirim:", JSON.stringify(payload));
        
        await this.updateRequest(id, payload);
    }


    // --- CRUD ACTIONS ---

    /**
     * @param {Object} context - { workspace_id, collection_id, folder_id (opsional) }
     */
    async createRequest(context) {
        try {
            // 1. Panggil Service
            const newReq = await RequestService.create({
                ...context,
                name: "New Request",
                method: "GET"
            });

            // 2. Broadcast ke tab lain
            this.bc.postMessage({ type: 'REQUEST_CREATED', data: newReq });

            // 3. Update State lokal & Render
            this.State.requests.push(newReq);
            this.render();
            
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
            this.render();
        } catch (err) {
            console.error("Gagal delete request:", err);
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
                this.render();
            }
        } catch (err) {
            console.error("Gagal update request:", err);
        }
    }

}