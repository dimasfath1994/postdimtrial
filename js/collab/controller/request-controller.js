//request-controller.js

import { RequestService } from "../request-service.js";
import { RequestUI } from "../ui/request-ui.js"; 
import { DataBridge } from './bridge.js'; // Pastikan import ini

export class RequestController {
    constructor(ui, State, { onUpdateUI, tabCtrl }) {
        this.ui = ui; // Container untuk request di sidebar/folder
        this.State = State;
        this.onUpdateUI = onUpdateUI;
        this.tabCtrl = tabCtrl;
        
        // BroadcastChannel untuk sinkronisasi antar tab
        this.bc = new BroadcastChannel('request_channel');
        this.setupBroadcastListener();

        window.addEventListener('body-mode-changed', (e) => {
            const { mode, requestId } = e.detail;
            this.State.activeBodyMode = mode;
            
            // Auto-save ke database saat mode berubah
            this.updateRequestBodyMode(requestId, mode);
        });

        // Socket listener dari pusat (collab-app.js)
        window.addEventListener("socket:message", (e) => {
            const payload = e.detail;
            if (payload.type && payload.type.startsWith('REQUEST_')) {
                this.handleSocketMessage(payload);
            }
        });

        window.addEventListener('popstate', () => {
            this.syncParamsFromUrl();
        });

        this.handlers = {
            onRename: (id, newName) => this.renameRequest(id, newName),
            onDuplicate: (req) => this.duplicateRequest(req),
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
            if (updatedData.url) {
                const urlEl = document.getElementById('url');
                if (urlEl) urlEl.value = updatedData.url;
            }
            if (updatedData.body) {
                const bodyEl = document.getElementById('body');
                if (bodyEl) bodyEl.value = updatedData.body;
            }
            // Jika nanti ada perubahan 'method', bisa update badge-nya di sini
            if (updatedData.method) {
                const methodEl = itemEl.querySelector('.method-badge');
                if (methodEl) {
                    methodEl.className = `method-badge ${updatedData.method}`;
                    methodEl.textContent = updatedData.method;


                    const methEl = document.getElementById('method');
                    methEl.value = updatedData.method;
                }
            }


            // Tambahkan logika update untuk tab yang sedang aktif (jika ada)
            const authTypeEl = document.getElementById('authType');
            const authValueEl = document.getElementById('authValue');

            if (authTypeEl && updatedData.auth_type !== undefined) {
                authTypeEl.value = updatedData.auth_type;
            }
            if (authValueEl && updatedData.auth_value !== undefined) {
                authValueEl.value = updatedData.auth_value;
            }


            // if (updatedData.pre_script !== undefined || updatedData.post_script !== undefined) {
            //     this.tabCtrl.monacoCtrl.setValues(updatedData.pre_script, updatedData.post_script);
            // }
            
        }

        if (this.tabCtrl.activeTabId === requestId && this.tabCtrl.monacoCtrl) {
            const { pre_script, post_script } = updatedData;
        
            // Helper untuk update editor dengan aman
            const updateEditor = (editor, newValue) => {
                // 1. Amankan nilai agar tidak null/undefined
                const safeValue = newValue ?? ""; 
                
                // 2. Hanya update jika berbeda
                if (editor.getValue() !== safeValue) {
                    this.tabCtrl.isApplyingData = true;
                    try {
                        editor.setValue(safeValue);
                    } catch (err) {
                        console.error("Editor setValue failed:", err);
                    } finally {
                        this.tabCtrl.isApplyingData = false;
                    }
                }
            };
        
            if (pre_script !== undefined) updateEditor(this.tabCtrl.monacoCtrl.preEditor, pre_script);
            if (post_script !== undefined) updateEditor(this.tabCtrl.monacoCtrl.postEditor, post_script);
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

    isDraft(id) {
        return String(id).startsWith('draft_');
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

                    // JIKA mode berubah, trigger UI untuk pindah tab di user kolaborator
                    if (data.body_mode && this.tabCtrl.activeTabId === data.id) {
                        // Panggil langsung fungsi global yang kita siapkan di body-tabs.js
                        if (window.syncBodyModeUI) {
                            // Gunakan isInitial = true agar tidak memicu loop update ke server
                            window.syncBodyModeUI(data.body_mode, true);
                        }
                    }

                    if (this.tabCtrl) this.tabCtrl.updateTab(data.id, data);
                }
                break;
        }
    }



    async render() {
        // 1. Ambil semua koleksi utama
        const collectionItems = document.querySelectorAll('.collection-item');
    
        collectionItems.forEach(colEl => {
            const colId = colEl.dataset.collectionId;
            
            // Cari child-list UTAMA milik koleksi ini (yang ada di bawah collection-body)
            // Kita gunakan querySelector untuk mencari child-list yang levelnya langsung di bawah koleksi
            const rootChildList = colEl.querySelector(':scope > .child-list'); 
    
            if (rootChildList) {
                // 2. Filter: Hanya ambil request yang milik koleksi ini DAN tidak punya folder_id
                const rootRequests = this.State.requests.filter(r => 
                    String(r.collection_id) === String(colId) && !r.folder_id
                );
    
                // 3. Bersihkan HANYA request-item yang ada di level root ini
                // Kita tidak menyentuh .folder-item atau .child-list di dalamnya!
                const existingRequests = rootChildList.querySelectorAll(':scope > .request-item');
                existingRequests.forEach(el => el.remove());
    
                // 4. Render request root
                rootRequests.forEach(req => {
                    RequestUI.renderRequestItem(
                        req, 
                        rootChildList, 
                        this.handlers, 
                        (r) => this.tabCtrl.openTab(r)
                    );
                });
            }
        });
    
        console.log(`[DEBUG] Root render selesai tanpa mengganggu folder.`);
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


    updateUrlFromParams(params) {
        // 1. Ambil hanya yang enabled
        const activeParams = params.filter(p => p.enabled && p.key.trim() !== '');
        
        // 2. Buat string query
        const queryString = activeParams.map(p => 
            `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`
        ).join('&');
        
        // 3. Update URL browser tanpa refresh (ReplaceState)
        const baseUrl = window.location.pathname;
        const newUrl = queryString ? `${baseUrl}?${queryString}` : baseUrl;
        window.history.replaceState(null, '', newUrl);
    }
    
    /**
     * Parsing URL manual ke State params
     */
    syncParamsFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const newParams = [];
        
        urlParams.forEach((value, key) => {
            newParams.push({ key, value, enabled: true, description: '' });
        });
    
        // Panggil service untuk menyimpan ke DB dan broadcast
        // Anda perlu akses ke instance RequestParamController di sini
        if (window.paramCtrl) {
            window.paramCtrl.syncBulkUpdate(
                newParams.map(p => `${p.key}:${p.value}`).join('\n')
            );
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



    async createDraft(context) {
        const draftId = 'draft_' + Date.now(); // Generate ID lokal
        const draftData = {
            id: draftId,
            ...context,
            name: "New Draft Request",
            method: "GET",
            is_draft: true
        };

        // 1. Simpan ke DataBridge
        DataBridge.save(draftId, 'details', draftData, {});

        // 2. Update State lokal agar muncul di UI
        this.State.requests.push(draftData);
        if (this.onUpdateUI) this.onUpdateUI(this.State.requests);

        // 3. Broadcast ke tab lain
        this.bc.postMessage({ type: 'REQUEST_CREATED', data: draftData });

        // 4. Buka Tab
        if (this.tabCtrl) this.tabCtrl.openTab(draftData);

        return draftData;
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


// Di dalam RequestController class

async duplicateRequest(req) {
    try {
        // 1. Siapkan payload duplikat
        const duplicatePayload = {
            ...req,
            name: `${req.name} (Copy)`,
            // Hilangkan ID agar backend membuat ID baru
            id: undefined, 
            created_at: null,
            updated_at: null
        };

        // 2. Kirim ke server
        // Kita gunakan fungsi create yang sudah ada agar broadcast otomatis terkirim
        const newReq = await RequestService.create(duplicatePayload);

        // 3. Update State Lokal (opsional jika broadcast sudah menangani, 
        // tapi bagus untuk optimis UI)
        if (!this.State.requests.find(r => r.id === newReq.id)) {
            this.State.requests.push(newReq);
            
            // Render ke UI
            const container = document.querySelector(`[data-collection-id="${newReq.collection_id}"] .requests-list`);
            if (container) {
                RequestUI.renderRequestItem(newReq, container, this.handlers, (r) => this.tabCtrl.openTab(r));
            }
        }

        // 4. Broadcast sudah ditangani di dalam service/handleSocket
        console.log(`[SYNC] Request ${req.id} berhasil diduplikasi menjadi ${newReq.id}`);
        
    } catch (err) {
        console.error("Gagal menduplikasi request:", err);
        alert("Gagal melakukan duplikasi request.");
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
            if (this.isDraft(id)) {
                // Logika Lokal
                DataBridge.save(id, 'details', payload);
                this.bc.postMessage({ type: 'REQUEST_UPDATED', data: { ...payload, id } });
                return;
            }
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

    async updateRequestBodyMode(id, mode) {
        // Tambahkan normalisasi di sini agar konsisten dengan apa yang dikirim ke DB
        const cleanMode = (mode === 'formdata') ? 'form-data' : mode; 

        if (this.isDraft(id)) {
            // Ambil data draft dari DataBridge (bukan State karena State mungkin belum sync)
            const oldData = DataBridge.getAll(id) || this.getRequestById(id);
            const payload = { ...oldData, body_mode: cleanMode };
            
            DataBridge.save(id, 'details', payload, {});
            this.bc.postMessage({ type: 'REQUEST_UPDATED', data: { ...payload, id } });
            return;
        }
        
        try {
            const oldData = this.getRequestById(id);
            const payload = { ...oldData, body_mode: cleanMode };
            
            const updatedReq = await RequestService.update(id, payload);
            
            // State sudah di-merge dengan response server
            this.bc.postMessage({ type: 'REQUEST_UPDATED', data: updatedReq });
            
            const idx = this.State.requests.findIndex(r => r.id === id);
            if (idx !== -1) this.State.requests[idx] = { ...this.State.requests[idx], ...updatedReq };
        } catch (err) {
            console.error("Gagal update mode:", err);
        }
    }


    


    async updateRequestFull(id) {
        // 1. Ambil data lama dari State
        let oldData = this.getRequestById(id);
        if (this.isDraft(id)) {
            oldData = DataBridge.getAll(id) || {}; 
        }
        // if (!oldData) {
        //     console.error(`[ERROR] Request dengan ID ${id} tidak ditemukan di State!`);
        //     return;
        // }
        const scripts = this.tabCtrl.monacoCtrl.getValues();
    
        // 2. Buat payload lengkap: 
        // Ambil semua properti lama, lalu timpa dengan nilai baru dari DOM
        const payload = {
            ...oldData, // Mengambil semua field: workspace_id, folder_id, collection_id, dll
            ...scripts, // Ini akan memasukkan pre_script dan post_script
            name: document.getElementById('name')?.value || oldData.name,
            method: document.getElementById('method')?.value,
            url: document.getElementById('url')?.value,
            body: document.getElementById('body')?.value,
            body_mode: this.State.activeBodyMode || oldData.body_mode || 'none',
            auth_type: document.getElementById('authType')?.value,
            auth_value: document.getElementById('authValue')?.value
            //,pre_script: document.getElementById('preEditor')?.value,
            //post_script: document.getElementById('postEditor')?.value
        };

        if (this.isDraft(id)) {
            console.log("[DEBUG] Menyimpan URL ke Draft:", payload.url);
            DataBridge.save(id, 'details', payload, {});
            this.bc.postMessage({ type: 'REQUEST_UPDATED', data: { ...payload, id } });
            return; // Selesai di sini, tidak perlu panggil RequestService.update
        }
    
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