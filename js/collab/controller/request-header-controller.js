// js/controller/request-header-controller.js

import { RequestHeaderService } from "../request-header-service.js";
import { RequestHeaderUI } from "../ui/request-header-ui.js";

export class RequestHeaderController {
    constructor(State) {
        this.State = State;
        this.bc = new BroadcastChannel('request_header_channel');
        this.setupBroadcastListener();
    }

    /**
     * Inisialisasi: Render header untuk request yang sedang aktif
     */
    async init(requestId, container) {
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
        const success = await RequestHeaderService.delete(id);
        if (success) {
            this.bc.postMessage({ type: 'HEADER_DELETED', header_id: id });
            this.State.headers = this.State.headers.filter(h => h.id !== id);
            RequestHeaderUI.removeHeaderRow(id);
            RequestHeaderUI.updateBulkText(this.State.headers);
        }
    }

    async addHeader() {
        const newHeader = await RequestHeaderService.create({ 
            request_id: this.currentRequestId,
            key: '', value: '', enabled: true 
        });
        
        if (newHeader) {
            this.bc.postMessage({ type: 'HEADER_CREATED', data: newHeader });
        }
    }

    async syncBulkUpdate(text) {
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