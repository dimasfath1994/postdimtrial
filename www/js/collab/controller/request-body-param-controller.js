// js/controller/request-body-param-controller.js

import { RequestBodyParamService } from "../request-body-param-service.js";
import { RequestBodyParamUI } from "../ui/request-body-param-ui.js";
import { DataBridge } from './bridge.js'; // Pastikan import ini


export class RequestBodyParamController {
    constructor(State) {
        this.State = State;
        this.bc = new BroadcastChannel('request_body_param_channel');
        this.currentRequestId = null;
        this.currentMode = 'formdata'; // Default mode
        this.container = null;
        
        this.setupBroadcastListener();


    }

    /**
     * Inisialisasi controller untuk request tertentu
     */
    async init(requestId, container, mode = 'formdata') {
        if (!container) return; 
        
        if (this.currentRequestId === requestId && this.currentMode === mode && this.container === container) {
            return;
        }
        
        this.container = container;
        this.currentRequestId = requestId;
        this.currentMode = mode;
        
        this.container.innerHTML = ''; 
        
        // --- GATEKEEPER START ---
        let allParams = [];
        const isDraft = String(requestId).startsWith('draft_');
    
        if (isDraft) {
            // Ambil dari DataBridge (lokal), bukan Service (API)
            const draftData = DataBridge.getAll(requestId);
            allParams = draftData?.bodyParams || []; 
        } else {
            // Tetap gunakan Service as-is untuk request biasa
            allParams = await RequestBodyParamService.getByRequest(this.currentRequestId);
        }
        // --- GATEKEEPER END ---
        
        this.State.bodyParams = allParams.filter(p => p.mode === mode); 
        
        this.render();
    }
    
    render() {
        console.log("DEBUG: Render dipanggil. Container:", this.container);
        if (!this.container) return;
        
        RequestBodyParamUI.renderParams(this.State.bodyParams, this.container, {
            onUpdate: (id, data) => this.syncParamUpdate(id, data),
            onDelete: (id, path) => this.syncParamDelete(id, path),
            onAdd: (type, mode) => this.addParam(type, mode),
            onUpload: (file, id) => this.uploadFile(file, id)
        }, this.currentMode);
        
        console.log("DEBUG: UI render selesai.");
    }

    /**
     * Menangani update data dari tab lain via BroadcastChannel
     */
    handleSocketMessage(payload) {
        const { type, data, param_id } = payload;

        switch (type) {
            case 'BODY_PARAM_CREATED':
                if (data.mode === this.currentMode && !this.State.bodyParams.find(p => p.id === data.id)) {
                    this.State.bodyParams.push(data);
                    this.render();
                }
                break;

            case 'BODY_PARAM_UPDATED':
                const idx = this.State.bodyParams.findIndex(p => p.id === data.id);
                if (idx !== -1) {
                    this.State.bodyParams[idx] = { ...this.State.bodyParams[idx], ...data };
                    this.render(); 
                }
                break;

            case 'BODY_PARAM_DELETED':
                this.State.bodyParams = this.State.bodyParams.filter(p => p.id !== param_id);
                RequestBodyParamUI.removeParamRow(param_id);
                break;
        }
    }

    async syncParamUpdate(id, data) {
        const isDraft = String(this.currentRequestId).startsWith('draft_');
        let updated;
    
        if (isDraft) {
            // Gunakan fungsi DataBridge yang sudah kita buat sebelumnya
            DataBridge.updateArray(this.currentRequestId, 'bodyParams', id, data);
            updated = { id, ...data }; // Simulasi objek yang terupdate
        } else {
            // Logic existing
            updated = await RequestBodyParamService.update(id, { 
                ...data, 
                request_id: this.currentRequestId 
            });
        }
    
        if (updated) {
            this.bc.postMessage({ type: 'BODY_PARAM_UPDATED', data: updated });
            const idx = this.State.bodyParams.findIndex(p => p.id === id);
            if (idx !== -1) this.State.bodyParams[idx] = { ...this.State.bodyParams[idx], ...updated };
        }
    }

    async syncParamDelete(id, file_path = null) {
        const isDraft = String(this.currentRequestId).startsWith('draft_');
        let success = false;
    
        if (isDraft) {
            // Hapus dari DataBridge
            DataBridge.removeFromArray(this.currentRequestId, 'bodyParams', id);
            success = true;
        } else {
            // Logic existing
            success = await RequestBodyParamService.delete(id);
            if (success && file_path) await RequestBodyParamService.deleteFile(file_path);
        }
    
        if (success) {
            this.bc.postMessage({ type: 'BODY_PARAM_DELETED', param_id: id });
            this.State.bodyParams = this.State.bodyParams.filter(p => p.id !== id);
            RequestBodyParamUI.removeParamRow(id);
        }
    }

    async addParam(type = 'text', mode) {
        const isDraft = String(this.currentRequestId).startsWith('draft_');
        let newParam;
    
        if (isDraft) {
            // Buat objek dummy (DataBridge.push akan auto-generate ID)
            newParam = { request_id: this.currentRequestId, key: '', value: '', type, mode, enabled: true };
            DataBridge.push(this.currentRequestId, 'bodyParams', newParam);
        } else {
            // Logic existing
            newParam = await RequestBodyParamService.create({ 
                request_id: this.currentRequestId,
                key: '', value: '', type, mode, enabled: true 
            });
        }
    
        if (newParam) {
            this.State.bodyParams.push(newParam);
            this.bc.postMessage({ type: 'BODY_PARAM_CREATED', data: newParam });
            this.render();
        }
    }
    syncWithRequest(requestId) {
        this.currentRequestId = requestId;
        const isDraft = String(requestId).startsWith('draft_');
    
        // 1. Mencari data mode: Prioritas utama adalah DataBridge jika draft
        let req;
        if (isDraft) {
            // Ambil data langsung dari sumber kebenaran draft
            req = DataBridge.getAll(requestId);
        } else {
            // Tetap gunakan alur existing untuk request server
            req = window.requestController?.State?.requests?.find(r => r.id === requestId);
        }
        
        // 2. Set mode dengan aman
        this.currentMode = req?.body_mode || 'none'; 
        
        // 3. Pastikan container yang dicari sesuai dengan mode
        const container = this.currentMode === 'formdata' 
            ? document.getElementById('formDataList') 
            : (this.currentMode === 'urlencoded' ? document.getElementById('urlencodedList') : null);
            
        // 4. Hanya panggil init jika container ditemukan
        if (container) {
            this.init(requestId, container, this.currentMode);
        } else {
            // Jika mode 'none' atau container belum tersedia, cukup update dropdown
            const selectEl = document.getElementById('bodyModeSelect');
            if (selectEl) selectEl.value = this.currentMode;
        }
    }

    async uploadFile(file, paramId = null) {
        const isDraft = String(this.currentRequestId).startsWith('draft_');

        // 1. Jika Draft, baca file lokal sebagai Base64
        let fileMetadata = { key: file.name, value: '', file_name: file.name, type: 'file' };
        
        if (isDraft) {
            fileMetadata.value = await this.fileToBase64(file); // Konversi ke Base64
        } else {
            // Jika Normal, tetap upload ke server
            const result = await RequestBodyParamService.uploadFile(file);
            if (!result) return;
            fileMetadata.value = result.file_path;
            fileMetadata.file_name = result.file_name;
        }

        const payload = {
            request_id: this.currentRequestId,
            ...fileMetadata,
            mode: this.currentMode,
            enabled: true
        };

        // 2. Lanjutkan dengan logika sinkronisasi (update/add)
        if (paramId) {
            await this.syncParamUpdate(paramId, payload);
        } else {
            if (isDraft) {
                DataBridge.push(this.currentRequestId, 'bodyParams', payload);
                this.State.bodyParams.push(payload);
                this.bc.postMessage({ type: 'BODY_PARAM_CREATED', data: payload });
            } else {
                const newParam = await RequestBodyParamService.create(payload);
                if (newParam) {
                    this.State.bodyParams.push(newParam);
                    this.bc.postMessage({ type: 'BODY_PARAM_CREATED', data: newParam });
                }
            }
        }
        this.render();
    }


    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }


    async migrateBodyParamsToRequest(reqId, bodyParams) {
        if (!bodyParams || !Array.isArray(bodyParams) || bodyParams.length === 0) return;
    
        console.log(`[Migration] Memulai migrasi ${bodyParams.length} body params ke request ID: ${reqId}`);
    
        for (const bp of bodyParams) {
            try {
                // Destructuring untuk membuang ID lokal
                const { id, ...data } = bp; 
    
                // Panggil Service create
                // Data sudah mengandung 'value' (bisa berupa string atau Base64)
                const createdParam = await RequestBodyParamService.create({ 
                    ...data, 
                    request_id: reqId,
                    enabled: data.enabled !== undefined ? data.enabled : true
                });
                
                if (createdParam) {
                    console.log(`[Migration] Berhasil memigrasi body param: ${createdParam.key || 'file'}`);
                }
            } catch (err) {
                console.error(`[Migration] Gagal memigrasi body param: ${bp.key}`, err);
            }
        }
    }

    setupBroadcastListener() {
        this.bc.onmessage = (event) => {
            this.handleSocketMessage(event.data);
        };
    }

    render() {
        if (!this.container) return;
        
        // Panggil UI dengan state bodyParams dan mode saat ini
        RequestBodyParamUI.renderParams(this.State.bodyParams, this.container, {
            onUpdate: (id, data) => this.syncParamUpdate(id, data),
            onDelete: (id, path) => this.syncParamDelete(id, path),
            onAdd: (type, mode) => this.addParam(type, mode),
            onUpload: (file, id) => this.uploadFile(file, id)
        }, this.currentMode);
    }
}