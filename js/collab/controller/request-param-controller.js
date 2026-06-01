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
        this.currentRequestId = requestId;
        this.container = container;

        const params = await RequestParamService.getByRequest(requestId);
        this.State.params = params; // Simpan di state global/lokal

        console.log("Data mentah dari DB:", params);

        RequestParamUI.renderParams(params, container, {
            onUpdate: (id, data) => this.syncParamUpdate(id, data),
            onDelete: (id) => this.syncParamDelete(id),
            onAdd: () => this.addParam()
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
                break;
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
        }
    }

    async syncParamDelete(id) {
        const success = await RequestParamService.delete(id);
        if (success) {
            this.bc.postMessage({ type: 'PARAM_DELETED', param_id: id });
            this.State.params = this.State.params.filter(p => p.id !== id);
            RequestParamUI.removeParamRow(id);
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
            onAdd: () => this.addParam()
        });
    }
}