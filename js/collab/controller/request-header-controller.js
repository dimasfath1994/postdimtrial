// js/controller/request-header-controller.js

import { RequestHeaderService } from "../request-header-service.js";
import { RequestHeaderUI } from "../ui/request-header-ui.js";
import { DataBridge } from './bridge.js'; // Pastikan import ini

export class RequestHeaderController {
    constructor(State) {
        this.State = State;
        this.bc = new BroadcastChannel('request_header_channel');
        this.setupBroadcastListener();
    }

    // --- Tambahkan Getter ini ---
    get activeId() {
        return window.tabCtrl?.activeTabId || this.currentRequestId;
    }

    /**
     * Inisialisasi: Render header untuk request yang sedang aktif
     */
    async init(requestId, container, isDraft) {
        if (!container) return;
        
        // --- GUARD MUTLAK ---
        const forceIsDraft = String(requestId).startsWith('draft_');
        
        if (forceIsDraft) {
            console.log(`[GUARD] Mode Draft aktif untuk ${requestId}. Membatalkan API call.`);
            this.container = container; // Tetap simpan container
            const localHeaders = DataBridge.load(requestId, 'headers') || [];
            this.renderHeaders(localHeaders);
            return; 
        }
        console.log("DEBUG: init header dipanggil untuk ID:", requestId);
        console.log("DEBUG: container yang diterima:", container);
        this.container = container;
        this.container.innerHTML = '';
        
        this.currentRequestId = requestId;
    
        const headers = await RequestHeaderService.getByRequest(requestId);
        this.State.headers = headers; 
    
        // Pastikan ini terjalankan
        RequestHeaderUI.renderHeaders(headers, container, {
            onUpdate: (id, data) => this.syncHeaderUpdate(id, data),
            onDelete: (id) => this.syncHeaderDelete(id),
            onAdd: () => this.addHeader(),
            onBulkUpdate: (text) => this.syncBulkUpdate(text)
        });
    }

    renderHeaders(headers) {
        RequestHeaderUI.renderHeaders(headers, this.container, {
            onUpdate: (id, data) => this.syncHeaderUpdate(id, data),
            onDelete: (id) => this.syncHeaderDelete(id),
            onAdd: () => this.addHeader(),
            onBulkUpdate: (text) => this.syncBulkUpdate(text)
        });
    }

    syncStateFromDOM() {
        if (!this.container) return;
        
        const rows = this.container.querySelectorAll('.header-row');
        const newHeaders = Array.from(rows).map(row => {
            const id = parseInt(row.dataset.id);
            const key = row.querySelector('.header-key')?.value;
            const value = row.querySelector('.header-value')?.value;
            const enabled = row.querySelector('.header-enabled')?.checked;
            
            return { id, key, value, enabled };
        });

        // Update state agar data yang belum sempat di-sync ke server tetap terbaca
        this.State.headers = newHeaders;
    }

    /**
     * Handle Event dari Socket (Server)
     */
    handleSocketMessage(payload) {
        const { type, data, header_id } = payload;

        switch (type) {
            case 'HEADER_CREATED':
                const exists = this.State.headers.find(h => h.id === data.id);
                if (!exists) {
                    this.State.headers.push(data);
                    this.render();
                }
                break;

            case 'HEADER_UPDATED':
                const idx = this.State.headers.findIndex(h => h.id === data.id);
                if (idx !== -1) {
                    this.State.headers[idx] = { ...this.State.headers[idx], ...data };
                    
                    const row = document.querySelector(`.header-row[data-id="${data.id}"]`);
                    if (row) {
                        if (document.activeElement !== row.querySelector('.header-key')) 
                            row.querySelector('.header-key').value = data.key;
                        
                        if (document.activeElement !== row.querySelector('.header-value')) 
                            row.querySelector('.header-value').value = data.value;
                        
                        if (document.activeElement !== row.querySelector('.header-desc')) 
                            row.querySelector('.header-desc').value = data.description;
                            
                        row.querySelector('.header-enabled').checked = data.enabled;
                    }
                }
                break;

            case 'HEADER_DELETED':
                this.State.headers = this.State.headers.filter(h => h.id !== header_id);
                RequestHeaderUI.removeHeaderRow(header_id);
                const textarea = document.getElementById('header-bulk-textarea');
                if (textarea && document.activeElement !== textarea) {
                    RequestHeaderUI.updateBulkText(this.State.headers);
                }
                break;

            case 'HEADERS_BULK_UPDATED':
                this.State.headers = data;
                this.render();
                break;
        }
    }

    /**
     * Sinkronisasi ke Server & Broadcast ke tab lain
     */
    async syncHeaderUpdate(id, data) {
        const activeId = this.activeId; // Gunakan getter activeId
        // Cek apakah mode draft
        if (String(activeId).startsWith('draft_')) {
            console.log(`[SYNC] Updating draft header ${id} in DataBridge`);
            DataBridge.updateArray(activeId, 'headers', id, data); // <--- INI PERUBAHANNYA
            return;
        }
        const updated = await RequestHeaderService.update(id, { 
            ...data, 
            request_id: this.currentRequestId 
        });
    
        if (updated) {
            this.bc.postMessage({ type: 'HEADER_UPDATED', data: updated });
            
            const idx = this.State.headers.findIndex(h => h.id === id);
            if (idx !== -1) {
                this.State.headers[idx] = { ...this.State.headers[idx], ...updated };
            }
        }
    }

    async syncHeaderDelete(id) {
        const activeId = this.activeId; // Gunakan getter activeId
        if (String(activeId).startsWith('draft_')) {
            console.log(`[SYNC] Updating draft header ${id} in DataBridge`);
            DataBridge.removeFromArray(activeId, 'headers', id);
            RequestHeaderUI.removeHeaderRow(id);
            return;
        }
        const success = await RequestHeaderService.delete(id);
        if (success) {
            this.bc.postMessage({ type: 'HEADER_DELETED', header_id: id });
            this.State.headers = this.State.headers.filter(h => h.id !== id);
            RequestHeaderUI.removeHeaderRow(id);
            RequestHeaderUI.updateBulkText(this.State.headers);
        }
    }

    async addHeader() {
        const activeId = this.activeId;

        if (String(activeId).startsWith('draft_')) {
            const newItem = { activeId, key: '', value: '', enabled: true };
            DataBridge.push(activeId, 'headers', newItem);
            this.renderHeaders(DataBridge.load(activeId, 'headers'));
            return;
        }
        const newHeader = await RequestHeaderService.create({ 
            request_id: this.currentRequestId,
            key: '', value: '', enabled: true 
        });
        
        if (newHeader) {
            this.bc.postMessage({ type: 'HEADER_CREATED', data: newHeader });
        }
    }


    async migrateHeadersToRequest(reqId, headers) {
        if (!headers || !Array.isArray(headers) || headers.length === 0) return;
    
        console.log(`[Migration] Memulai migrasi ${headers.length} headers ke request ID: ${reqId}`);
    
        for (const h of headers) {
            try {
                // Destructuring untuk membuang ID lokal (item_...)
                const { id, ...data } = h; 
    
                // Panggil method 'create' milik RequestHeaderService
                // Kita gunakan RequestHeaderService.create langsung jika sudah tersedia
                const createdHeader = await RequestHeaderService.create({ 
                    ...data, 
                    request_id: reqId,
                    enabled: data.enabled !== undefined ? data.enabled : true
                });
                
                if (createdHeader) {
                    console.log(`[Migration] Berhasil memigrasi header: ${createdHeader.key}`);
                }
            } catch (err) {
                console.error(`[Migration] Gagal memigrasi header: ${h.key}`, err);
            }
        }
    }

    async syncBulkUpdate(text) {
        const activeId = this.activeId; // Gunakan getter activeId
        if (String(activeId).startsWith('draft_')) {
            const lines = text.split('\n');
            
            // Cukup petakan ke objek, biarkan DataBridge yang memberi ID
            const items = lines.map(line => {
                const parts = line.split(':');
                return {
                    key: parts[0]?.trim() || '',
                    value: parts.slice(1).join(':').trim() || '',
                    enabled: true
                };
            }).filter(item => item.key !== '');
    
            // Simpan via DataBridge
            const savedItems = DataBridge.bulkCreate(activeId, 'headers', items);
            
            // Render
            this.renderHeaders(savedItems);
            return;
        }
        
        const lines = text.split('\n');
        
        const headers = lines.map((line, index) => {
            const parts = line.split(':');
            const key = parts[0]?.trim() || '';
            const value = parts.slice(1).join(':').trim() || '';
            
            const existingHeader = this.State.headers[index];
            
            return { 
                description: existingHeader ? existingHeader.description : '', 
                key, 
                value, 
                enabled: existingHeader ? existingHeader.enabled : true,
                sort_order: index
            };
        }).filter(h => h.key !== '');
    
        const updatedHeaders = await RequestHeaderService.bulkUpdate(this.currentRequestId, headers);
    
        if (updatedHeaders) {
            this.bc.postMessage({ type: 'HEADERS_BULK_UPDATED', data: updatedHeaders });
            this.State.headers = updatedHeaders;
            this.render();
        }
    }

    setupBroadcastListener() {
        this.bc.onmessage = (event) => {
            this.handleSocketMessage(event.data);
        };
    }

    render() {
        RequestHeaderUI.renderHeaders(this.State.headers, this.container, {
            onUpdate: (id, data) => this.syncHeaderUpdate(id, data),
            onDelete: (id) => this.syncHeaderDelete(id),
            onAdd: () => this.addHeader(),
            onBulkUpdate: (text) => this.syncBulkUpdate(text)
        });
    }
}