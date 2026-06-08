// js/controller/request-param-controller.js

import { RequestParamService } from "../request-param-service.js";
import { RequestParamUI } from "../ui/request-param-ui.js";
import { DataBridge } from './bridge.js'; // Pastikan import ini

export class RequestParamController {
    constructor(State) {
        this.State = State;
        this.bc = new BroadcastChannel('request_param_channel');
        this.setupBroadcastListener();
    }

    /**
     * Inisialisasi: Render parameter untuk request yang sedang aktif
     */
    async init(requestId, container, isDraft) {
        if (!container) return;

        // --- GUARD MUTLAK: HARUS DI BARIS PERTAMA ---
        // Jangan percaya isDraft yang dikirim dari luar, cek langsung ID-nya
        const forceIsDraft = String(requestId).startsWith('draft_');

        if (forceIsDraft) {
            console.log(`[GUARD] Mode Draft aktif untuk ${requestId}. Membatalkan API call.`);
            this.container = container; 
            // Ambil dari DataBridge (lokal), bukan dari Service (API)
            const localParams = DataBridge.load(requestId, 'params') || [];
            this.renderParams(localParams);
            return; // PENTING: Return agar kode di bawah tidak tereksekusi!
        }
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

        // Helper untuk render agar konsisten
    renderParams(params) {
        RequestParamUI.renderParams(params, this.container, {
            onUpdate: (id, data) => this.syncParamUpdate(id, data),
            onDelete: (id) => this.syncParamDelete(id),
            onAdd: () => this.addParam(),
            onBulkUpdate: (text) => this.syncBulkUpdate(text)
        });
    }

    // Tambahkan helper agar tidak double code
    renderHeaders(headers) {
        RequestHeaderUI.renderHeaders(headers, this.container, {
            onUpdate: (id, data) => this.syncParamUpdate(id, data),
            onDelete: (id) => this.syncParamDelete(id),
            onAdd: () => this.addHeader(),
            onBulkUpdate: (text) => this.syncBulkUpdate(text)
        });
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
                const textarea = document.getElementById('param-bulk-textarea');
                //RequestParamUI.updateBulkText(this.State.params, this.container);
                break;

            case 'PARAMS_BULK_UPDATED':
                this.State.params = data;
                this.render(); // Refresh total karena struktur data berubah total
                break;
        }
    }
    static updateBulkText(params, container) {
        const textarea = container.querySelector('#param-bulk-textarea');
        if (textarea) {
            const textToDisplay = params.map(p => `${p.key}:${p.value}`).join('\n');
            textarea.value = textToDisplay; // Update value
            
            // Log ini untuk memastikan!
            console.log("DEBUG: Textarea.value sekarang adalah:", textarea.value);
        }
    }
    /**
     * Sinkronisasi ke Server & Broadcast ke tab lain
     */
    async syncParamUpdate(id, data) {
        const activeId = window.tabCtrl.activeTabId;

    // 1. Jika ini DRAFT, update ke DataBridge saja, jangan panggil API
        if (String(activeId).startsWith('draft_')) {
            console.log(`[SYNC] Updating draft param ${id} in DataBridge`);
            DataBridge.updateArray(activeId, 'params', id, data);
            return; 
        }
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
        const activeId = window.tabCtrl.activeTabId;
        if (String(activeId).startsWith('draft_')) {
            DataBridge.removeFromArray(activeId, 'params', id);
            RequestParamUI.removeParamRow(id);
            return;
        }
        const success = await RequestParamService.delete(id);
        if (success) {
            this.State.params = this.State.params.filter(p => Number(p.id) !== Number(id));
            RequestParamUI.removeParamRow(id);
            
            // PENTING: Kirim this.container di sini
            //RequestParamUI.updateBulkText(this.State.params, this.container);
            
            this.bc.postMessage({ type: 'PARAM_DELETED', param_id: id });
        }
    }

    async addParam() {
        const activeId = window.tabCtrl.activeTabId;
        console.log("active id", activeId);
        // Sekarang lanjut ke logika kamu
        if (String(activeId).startsWith('draft_')) {
            const newItem = { id: activeId, key: '', value: '', enabled: true };
            DataBridge.push(activeId, 'params', newItem);
            this.renderParams(DataBridge.load(activeId, 'params'));
            return;
        }
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


    async migrateParamsToRequest(newReqId, params) {
        if (!params || !Array.isArray(params) || params.length === 0) {
            console.log("[Migration] Tidak ada parameter untuk dimigrasi.");
            return;
        }
    
        console.log(`[Migration] Memulai migrasi ${params.length} parameter ke request: ${newReqId}`);
    
        for (const p of params) {
            try {
                // 1. Destructuring untuk membuang ID lokal (yang berformat 'item_...')
                // Kita hanya butuh data asli agar bisa dibuatkan ID baru oleh database server
                const { id, ...data } = p; 
    
                // 2. Pastikan request_id di-update ke ID server yang baru
                const payload = {
                    ...data,
                    request_id: newReqId,
                    enabled: data.enabled !== undefined ? data.enabled : true
                };
    
                // 3. Panggil service untuk membuat record di DB
                const createdParam = await RequestParamService.create(payload);
                
                if (createdParam) {
                    console.log(`[Migration] Berhasil membuat param: ${createdParam.id}`);
                }
            } catch (err) {
                console.error(`[Migration] Gagal membuat parameter: ${p.key}`, err);
            }
        }
        
        console.log("[Migration] Proses migrasi parameter selesai.");
    }

    async syncBulkUpdate(text) {
        const activeId = window.tabCtrl.activeTabId;
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