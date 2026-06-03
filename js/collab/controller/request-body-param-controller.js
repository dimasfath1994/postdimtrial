// js/controller/request-body-param-controller.js

import { RequestBodyParamService } from "../request-body-param-service.js";
import { RequestBodyParamUI } from "../ui/request-body-param-ui.js";

export class RequestBodyParamController {
    constructor(State) {
        this.State = State;
        this.bc = new BroadcastChannel('request_body_param_channel');
        this.currentRequestId = null;
        this.currentMode = 'formdata'; // Default mode
        this.container = null;
        
        this.setupBroadcastListener();

        // Listener mandiri: merespon pindah tab tanpa campur tangan TabController
        window.addEventListener('tab-changed', (e) => {
            this.currentRequestId = e.detail.id;
            // Kita inisialisasi ulang dengan mode yang tersimpan saat ini
            this.init(this.currentRequestId, this.container, this.currentMode);
        });
    }

    /**
     * Inisialisasi controller untuk request tertentu
     */
    async init(requestId, container, mode = 'formdata') {
        console.log("DEBUG: Controller.init dipanggil dengan:", { requestId, container, mode });
        
        if (container) this.container = container;
        if (!this.container) {
            console.error("DEBUG: Container KOSONG! Pastikan ID element ada di HTML.");
            return;
        }
    
        this.currentRequestId = requestId;
        this.currentMode = mode;
        this.container.innerHTML = ''; // Coba lihat apakah ini terhapus
        
        if (!this.currentRequestId) return;
        
        const allParams = await RequestBodyParamService.getByRequest(this.currentRequestId);
        this.State.bodyParams = allParams.filter(p => p.mode === mode); 
        
        console.log("DEBUG: Params yang ditemukan:", this.State.bodyParams);
        this.render();
        const selectEl = document.getElementById('bodyModeSelect');
        if (selectEl) {
            selectEl.value = mode;
        }
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
        const updated = await RequestBodyParamService.update(id, { 
            ...data, 
            request_id: this.currentRequestId 
        });
    
        if (updated) {
            this.bc.postMessage({ type: 'BODY_PARAM_UPDATED', data: updated });
            const idx = this.State.bodyParams.findIndex(p => p.id === id);
            if (idx !== -1) this.State.bodyParams[idx] = { ...this.State.bodyParams[idx], ...updated };
        }
    }

    async syncParamDelete(id, file_path = null) {
        const success = await RequestBodyParamService.delete(id);
        if (success) {
            if (file_path) {
                await RequestBodyParamService.deleteFile(file_path);
            }
            this.bc.postMessage({ type: 'BODY_PARAM_DELETED', param_id: id });
            this.State.bodyParams = this.State.bodyParams.filter(p => p.id !== id);
            RequestBodyParamUI.removeParamRow(id);
        }
    }

    async addParam(type = 'text', mode) {
        const newParam = await RequestBodyParamService.create({ 
            request_id: this.currentRequestId,
            key: '', value: '', type, mode, enabled: true 
        });
        
        if (newParam) {
            this.State.bodyParams.push(newParam);
            this.bc.postMessage({ type: 'BODY_PARAM_CREATED', data: newParam });
            this.render();
        }
    }
    syncWithRequest(requestId) {
    this.currentRequestId = requestId;
    
    // Proteksi: Pastikan requestController ada sebelum mengakses state-nya
    const req = window.requestController?.State?.requests?.find(r => r.id === requestId);
    
    // Jika req tidak ketemu, kita pakai 'none' atau 'formdata' secara aman
    this.currentMode = req?.body_mode || 'none'; 
    
    // Pastikan container yang dicari sesuai dengan mode
    const container = this.currentMode === 'formdata' 
        ? document.getElementById('formDataList') 
        : (this.currentMode === 'urlencoded' ? document.getElementById('urlencodedList') : null);
        
    // Hanya panggil init jika container ditemukan
    if (container) {
        this.init(requestId, container, this.currentMode);
    } else {
        // Jika mode 'none' atau container belum tersedia, cukup update dropdown
        const selectEl = document.getElementById('bodyModeSelect');
        if (selectEl) selectEl.value = this.currentMode;
    }
}

    async uploadFile(file, paramId = null) {
        const result = await RequestBodyParamService.uploadFile(file);
        if (result) {
            const payload = {
                request_id: this.currentRequestId,
                key: file.name,
                value: result.file_path,
                file_name: result.file_name,
                type: 'file',
                mode: this.currentMode,
                enabled: true
            };

            if (paramId) {
                await this.syncParamUpdate(paramId, payload);
            } else {
                const newParam = await RequestBodyParamService.create(payload);
                if (newParam) {
                    this.State.bodyParams.push(newParam);
                    this.bc.postMessage({ type: 'BODY_PARAM_CREATED', data: newParam });
                }
            }
            this.render();
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