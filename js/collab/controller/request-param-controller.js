// js/controller/request-param-controller.js

import { RequestParamService } from "../request-param-service.js";
import { RequestParamUI } from "../ui/request-param-ui.js";

export class RequestParamController {
    constructor(State) {
        this.State = State;
        this.bc = new BroadcastChannel('request_param_channel');
        this.setupBroadcastListener();
    }

    /**
     * Inisialisasi: Render parameter untuk request yang sedang aktif
     */
    async init(requestId, container) {
        console.log("DEBUG: RequestHeaderController.init dipanggil untuk reqId:", requestId);
        this.currentRequestId = requestId;
        this.container = container;
        this.container.innerHTML = '';

        const params = await RequestParamService.getByRequest(requestId);
        this.State.params = params; // Simpan di state global/lokal

        if (params.length === 0 && window.location.search) {
            this.parseUrlParams();
        }

        console.log("Data mentah dari DB:", params);

        RequestParamUI.renderParams(params, container, {
            onUpdate: (id, data) => this.syncParamUpdate(id, data),
            onDelete: (id) => this.syncParamDelete(id),
            onAdd: () => this.addParam(),
            onBulkUpdate: (text) => this.syncBulkUpdate(text)
        });

        console.log("DEBUG: renderHeaders selesai dijalankan.");
    }

    /**
     * Handle Event dari Socket (Server)
     */
    handleSocketMessage(payload) {
        const { type, data, param_id } = payload;

        switch (type) {
            case 'PARAM_CREATED':
                // Cek dulu apakah data sudah ada di state agar tidak duplikat
                const exists = this.State.params.find(p => p.id === data.id);
                if (!exists) {
                    this.State.params.push(data);
                    this.render(); // Ini akan merender ulang seluruh list, memastikan UI = State
                }
                break;

            case 'PARAM_UPDATED':
                const idx = this.State.params.findIndex(p => p.id === data.id);
                if (idx !== -1) {
                    // Update State
                    this.State.params[idx] = { ...this.State.params[idx], ...data };
                    
                    // Update UI secara spesifik tanpa render ulang seluruh tabel
                    const row = document.querySelector(`.param-row[data-id="${data.id}"]`);
                    if (row) {
                        // Update field tanpa menghancurkan elemen input yang sedang difokuskan
                        if (document.activeElement !== row.querySelector('.param-key')) 
                            row.querySelector('.param-key').value = data.key;
                        
                        if (document.activeElement !== row.querySelector('.param-value')) 
                            row.querySelector('.param-value').value = data.value;
                        
                        if (document.activeElement !== row.querySelector('.param-desc')) 
                            row.querySelector('.param-desc').value = data.description;
                            
                        row.querySelector('.param-enabled').checked = data.enabled;
                    }
                }
                break;   

            case 'PARAM_DELETED':
                this.State.params = this.State.params.filter(p => p.id !== param_id);
                RequestParamUI.removeParamRow(param_id);
                const textarea = document.getElementById('bulk-textarea');
                if (textarea && document.activeElement !== textarea) {
                    RequestParamUI.updateBulkText(this.State.params);
                }
                break;

            case 'PARAMS_BULK_UPDATED':
                this.State.params = data;
                this.render(); // Refresh total karena struktur data berubah total
                break;
        }
    }

    static updateBulkText(params) {
        const textarea = document.getElementById('bulk-textarea');
        if (textarea) {
            // Update isi textarea dengan state params terbaru
            textarea.value = params.map(p => `${p.key}:${p.value}`).join('\n');
        }
    }
    /**
     * Sinkronisasi ke Server & Broadcast ke tab lain
     */
    async syncParamUpdate(id, data) {
        // 1. Update ke Database
        const updated = await RequestParamService.update(id, { 
            ...data, 
            request_id: this.currentRequestId 
        });
    
        if (updated) {
            // 2. Broadcast ke semua tab/aplikasi lain
            this.bc.postMessage({ 
                type: 'PARAM_UPDATED', 
                data: updated 
            });
            
            // 3. Update State Lokal (Agar sinkron jika ada logika lain yang pakai state)
            const idx = this.State.params.findIndex(p => p.id === id);
            if (idx !== -1) {
                this.State.params[idx] = { ...this.State.params[idx], ...updated };
            }

            // Di dalam syncBulkUpdate atau callback update
            if (window.requestCtrl) {
                window.requestCtrl.updateUrlFromParams(this.State.params);
            }
        }
    }

    async syncParamDelete(id) {
        const success = await RequestParamService.delete(id);
        if (success) {
            this.bc.postMessage({ type: 'PARAM_DELETED', param_id: id });
            this.State.params = this.State.params.filter(p => p.id !== id);
            RequestParamUI.removeParamRow(id);
            RequestParamUI.updateBulkText(this.State.params);
        }
    }

    async addParam() {
        // 1. Simpan ke Database
        const newParam = await RequestParamService.create({ 
            request_id: this.currentRequestId,
            key: '', value: '', enabled: true 
        });
        
        // 2. Jika sukses, render baris baru menggunakan data asli dari DB
        if (newParam) {
            this.State.params.push(newParam);
            this.bc.postMessage({ type: 'PARAM_CREATED', data: newParam });
            
            // Kirim 'newParam' ke UI agar ID-nya sinkron
            // RequestParamUI.appendNewRow(this.container, newParam, {
            //     onUpdate: (id, data) => this.syncParamUpdate(id, data),
            //     onDelete: (id) => this.syncParamDelete(id)
            // });
        }
    }

    async syncBulkUpdate(text) {
        const lines = text.split('\n');
        
        // Kita buat array params baru dengan mempertahankan data lama dari State
        // berdasarkan urutan index baris.
        const params = lines.map((line, index) => {
            const parts = line.split(':');
            const key = parts[0]?.trim() || '';
            const value = parts.slice(1).join(':').trim() || '';
            
            // Coba cari data lama berdasarkan index yang sama
            const existingParam = this.State.params[index];
            
            return { 
                // Jika key/value di baris index ini adalah baris yang sama dengan sebelumnya, 
                // ambil description-nya.
                description: existingParam ? existingParam.description : '', 
                key, 
                value, 
                enabled: existingParam ? existingParam.enabled : true,
                sort_order: index // Mengikuti urutan baris baru
            };
        }).filter(p => p.key !== '');
    
        // Panggil Service Bulk Update
        const updatedParams = await RequestParamService.bulkUpdate(this.currentRequestId, params);
    
        if (updatedParams) {
            this.bc.postMessage({ type: 'PARAMS_BULK_UPDATED', data: updatedParams });
            this.State.params = updatedParams;
            this.render();
            // Di dalam syncBulkUpdate atau callback update
            if (window.requestCtrl) {
                window.requestCtrl.updateUrlFromParams(this.State.params);
            }
        }
    }

    setupBroadcastListener() {
        this.bc.onmessage = (event) => {
            console.log("[DEBUG BROADCAST PARAM] Menerima:", event.data);
            this.handleSocketMessage(event.data);
        };
    }

    render() {
        RequestParamUI.renderParams(this.State.params, this.container, {
            onUpdate: (id, data) => this.syncParamUpdate(id, data),
            onDelete: (id) => this.syncParamDelete(id),
            onAdd: () => this.addParam(),
            onBulkUpdate: (text) => this.syncBulkUpdate(text)
        });
    }

    // Di dalam class RequestParamController

    parseUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        if ([...urlParams].length === 0) return; // Keluar jika tidak ada parameter di URL

        const newParams = [];
        urlParams.forEach((value, key) => {
            newParams.push({ 
                key: key, 
                value: value, 
                enabled: true, 
                description: 'Auto-imported from URL' 
            });
        });

        // Panggil fungsi bulk update untuk memasukkan data hasil parse ke DB
        // Pastikan kita sudah berada di context request yang benar
        if (this.currentRequestId) {
            this.syncBulkUpdate(
                newParams.map(p => `${p.key}:${p.value}`).join('\n')
            );
        }
    }
}