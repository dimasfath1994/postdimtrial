// js/collab/controller/tab-controller.js

import { RequestUI } from "../ui/request-ui.js"; 
import { DataBridge } from './bridge.js'; // Pastikan import ini
import { showDraftPicker } from '../ui/request-picker-draft.js';

export class TabController {
    constructor(ui, handlers, State, paramCtrl, headerCtrl) {
        this.tabs = [];
        this.activeTabId = null;
        this.handlers = handlers;
        this.getRequestData = null;
        this.State = State;

        this.paramCtrl = paramCtrl;
        this.headerCtrl = headerCtrl;

        document.addEventListener('blur', (e) => {
            if (e.target.classList.contains('auto-save')) {
                this.saveField(e);
            }
        }, true);
    }

    // Tambahkan method ini untuk sinkronisasi getter
    setRequestGetter(fn) {
        this.getRequestData = fn;
    }

    openTab(request) {
        const requestId = String(request.id || '');
        const isDraft = requestId.startsWith('draft_');
    
        // 1. Ambil data terbaru
        // Jika draft, kita ambil objek request yang dikirimkan.
        // Jika perlu sinkronisasi data terbaru dari DraftStore, bisa pakai DataBridge.
        let freshData;
        if (isDraft) {
            // Gabungkan request dengan data terbaru dari DraftStore jika ada update
            const draftDetails = DataBridge.getAll(requestId);
            freshData = { ...request, ...draftDetails };
        } else {
            freshData = (this.getRequestData && this.getRequestData(request.id)) || request;
        }
        
        // 2. Cek apakah tab sudah ada
        const tabItem = this.tabs.find(t => String(t.id) === String(freshData.id));
        
        if (!tabItem) {
            this.tabs.push(freshData);
            RequestUI.renderTab(
                freshData, 
                (id) => this.switchTab(id), 
                (id) => this.closeTab(id),
                this.handlers
            );
        } else {
            Object.assign(tabItem, freshData);
            const tabEl = document.querySelector(`.tab-item[data-id="${freshData.id}"]`);
            if (tabEl) {
                tabEl.querySelector('.tab-name').textContent = freshData.name;
            }
        }
        
        this.switchTab(freshData.id);
    }

    async clearResponse() {
        
    }

    forceCloseTab(id) {
        console.log("[TabController] Force closing tab:", id);
        
        const closedTabIndex = this.tabs.findIndex(t => t.id === id);
        
        // Tentukan next active
        let nextActiveId = null;
        if (this.activeTabId === id) {
            if (this.tabs.length > 1) {
                const newIndex = closedTabIndex === 0 ? 1 : closedTabIndex - 1;
                nextActiveId = this.tabs[newIndex].id;
            }
        } else {
            nextActiveId = this.activeTabId;
        }
    
        // Hapus dari state & DOM
        this.tabs = this.tabs.filter(t => t.id !== id);
        const tabEl = document.querySelector(`.tab-item[data-id="${id}"]`);
        if (tabEl) tabEl.remove();
    
        // Pindah tab atau reset editor
        if (nextActiveId) {
            this.switchTab(nextActiveId);
        } else {
            this.activeTabId = null;
            this.clearEditor();
            this.clearResponse();
        }
    }

    async closeTab(id) {
        const isDraft = String(id).startsWith('draft_');

        if (isDraft) {
            const wantsToSave = confirm("You have unsaved changes in this draft. Do you want to save it before closing?");
            
            if (wantsToSave) {
                console.log("[TabController] Membuka picker untuk:", id);
                // Kita buka picker-nya
                showDraftPicker(id);
                // KITA HARUS BERHENTI DI SINI! 
                // Jangan tutup tab-nya sekarang, karena user sedang memilih lokasi di modal.
                return; 
            }
            
            // Jika user tidak mau save, kita hapus draft-nya secara lokal
            DataBridge.cleanup(id);
        }
        const closedTabIndex = this.tabs.findIndex(t => t.id === id);
        
        // 1. Opsional: Auto-save sebelum tutup
        // await this.saveCurrentTabData(); 
    
        // 2. Tentukan tab mana yang akan aktif selanjutnya
        let nextActiveId = null;
        if (this.activeTabId === id) {
            if (this.tabs.length > 1) {
                // Jika ada tab lain, pilih tab di sebelah kiri, atau indeks yang sama
                const newIndex = closedTabIndex === 0 ? 1 : closedTabIndex - 1;
                nextActiveId = this.tabs[newIndex].id;
            }
        } else {
            nextActiveId = this.activeTabId;
        }
    
        // 3. Hapus dari State & DOM
        this.tabs = this.tabs.filter(t => t.id !== id);
        const tabEl = document.querySelector(`.tab-item[data-id="${id}"]`);
        if (tabEl) tabEl.remove();
    
        // 4. Pindah ke tab berikutnya atau bersihkan
        if (nextActiveId) {
            this.switchTab(nextActiveId); // Panggil fungsi switchTab kamu
        } else {
            this.activeTabId = null;
            this.clearEditor();
            this.clearResponse();
        }
    
        console.log("Tab closed, switched to:", nextActiveId);
    }

    clearEditor() {
        console.trace("[DEBUG] Siapa yang manggil clearEditor?");
        // 1. Reset Method & URL (DOM biasa)
        document.getElementById("method").value = "GET";
        document.getElementById("url").value = "";
        
        
        // 4. Reset Body Text/Raw
        const bodyEl = document.getElementById("body");
        if (bodyEl) bodyEl.value = "";

        // 5. Reset Response Area
        this.resetResponse();

        
    }
    resetResponse() {
        const statusBar = document.getElementById('statusBar');
        const contentDiv = document.getElementById('content');
        const lineNumbersDiv = document.getElementById('line-numbers');
        
        if (statusBar) statusBar.innerHTML = '<span>Status: -</span> <span>Time: -</span> <span>Size: -</span>';
        if (contentDiv) contentDiv.innerHTML = '';
        if (lineNumbersDiv) lineNumbersDiv.innerHTML = '';
    }

    // Di dalam class ResponseHandler atau sebagai helper biasa
    getResponseElements() {
        return {
            statusBar: document.getElementById('statusBar'),
            contentDiv: document.getElementById('content'),
            lineNumbersDiv: document.getElementById('line-numbers'),
            copyBtn: document.querySelector('.copy-btn')
        };
    }

    switchTab(id) {
        this.activeTabId = id;
        const isDraft = String(id).startsWith('draft_');
        const request = this.tabs.find(t => String(t.id) === String(id));
        
        if (!request) return;
    
        let finalData;
    
        if (isDraft) {
            const rawData = DataBridge.getAll(id) || {};
            
            // 1. Ambil data secara eksplisit (Pilih field yang valid saja)
            // Ini membuang properti 'details' secara otomatis karena kita tidak memanggilnya
            finalData = { 
                ...request,
                id: id,
                name: rawData.name || request.name || "New Request",
                method: rawData.method || request.method || "GET",
                url: rawData.url || request.url || "",
                body: rawData.body || "",
                body_mode: rawData.body_mode || (rawData.details?.body_mode) || request.body_mode || "none",
                auth_type: rawData.auth_type || "none",
                auth_value: rawData.auth_value || "",
                pre_script: rawData.pre_script || "",
                post_script: rawData.post_script || "",
                headers: rawData.headers || request.headers || [],
                params: rawData.params || request.params || []
            };

            console.log("[DEBUG] Data hasil rawData.body_mode:", rawData.body_mode);
            console.log("[DEBUG] Data hasil pembersihan:", finalData);
        } else {
            // Untuk non-draft, ambil dari request (State server)
            finalData = { ...request };
        }
    
        // Update UI Tab
        document.querySelectorAll('.tab-item').forEach(el => 
            el.classList.toggle('active', String(el.dataset.id) === String(id)));
                
        // Load ke Editor
        this.loadToEditor(finalData);
        
        // Refresh Panel
        const activePanel = document.querySelector('.tab-panel:not(.hidden)');
        const activePanelType = activePanel ? activePanel.getAttribute('data-panel') : 'params';
        this.refreshActivePanel(activePanelType, isDraft);
        
        // Sync Body Mode
        requestAnimationFrame(() => {
            if (finalData && typeof window.syncBodyModeUI === 'function') {
                let mode = finalData.body_mode || 'none';
                if (mode === 'formdata') mode = 'form-data'; 
                window.syncBodyModeUI(mode, true);
            }
        });
        
        window.dispatchEvent(new CustomEvent('request-tab-switched', {
            detail: { requestId: id },
        }));
    }

    refreshActivePanel(panelType, isDraft = false) { // Tambahkan isDraft di sini
        if (!this.activeTabId) return;
    
        const id = this.activeTabId;
        if (panelType === 'params') {
            const paramsBox = document.getElementById('paramsBox');
            console.log("DEBUG: Menginisialisasi ParamsBox, elemen ditemukan:", !!paramsBox);
            if (paramsBox) { this.paramCtrl.init(id, paramsBox, isDraft); }// Oper ke init
            else {
                console.error("DEBUG: Fatal! paramsBox tidak ditemukan di DOM saat mencoba render.");
            }
        } else if (panelType === 'headers') {
            const headersBox = document.getElementById('headersBox');
            if (headersBox) this.headerCtrl.init(id, headersBox, isDraft); // Oper ke init
        }
    }

    updateTab(requestId, updatedData) {
        const tab = document.querySelector(`.tab-item[data-id="${requestId}"]`);
        if (tab) {
            // Update DOM
            if (updatedData.name) {
                tab.querySelector('.tab-name').textContent = updatedData.name;
            }
            
            // PENTING: Update array lokal supaya data di dalam TabController fresh
            const tabData = this.tabs.find(t => t.id === requestId);
            if (tabData) {
                Object.assign(tabData, updatedData);
            }
        }
    }
    attachAutoSave(element) {
        element.addEventListener('blur', (e) => {
            // Jika sedang loading data, abaikan blur ini
            if (this.isApplyingData) return; 
            
            if (!this.activeTabId) return;
            this.handlers.onUpdateFull(this.activeTabId);
        });
    }

    saveField(e) {
        const el = e.target;
        // Cek apakah nilai DOM sama dengan nilai di state request yang sedang aktif
        const currentReq = this.tabs.find(t => t.id === this.activeTabId);
        if (el.value === (currentReq[el.id] || "")) {
            return; // Tidak ada perubahan, jangan panggil API
        }
        
        this.handlers.onUpdateFull(this.activeTabId);
    }

    loadToEditor(request) {
        // if (!request) {
        //     console.warn("TabController: Request data undefined, skipping editor load.");
        //     this.clearEditor(); 
        //     return;
        // }
        // if (String(request.id) !== String(this.activeTabId)) {
        //     console.log(`[GUARD] loadToEditor menolak render: ${request.id} bukan tab aktif (${this.activeTabId})`);
        //     return;
        // }
    
        this.isApplyingData = true;
    
        const fields = ['method', 'url', 'body', 'authType', 'authValue'];
        
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                let val = "";
                
                // Logika mapping dengan proteksi agar tidak menimpa dengan null
                if (id === 'authType') val = request.auth_type ?? 'none';
                else if (id === 'authValue') val = request.auth_value ?? '';
                else if (id === 'body') val = request.body ?? '';
                else if (id === 'method') val = request.method ?? 'GET';
                else val = request[id] ?? "";
    
                // PERUBAHAN: Hanya update jika value yang diterima valid atau memang ingin di-clear
                // Jika request.body null (dari proses sync), kita pertahankan nilai yang ada di DOM 
                // kecuali jika kita memang sedang melakukan switch tab (yang biasanya val-nya ada)
                if (val !== null && val !== undefined) {
                    el.value = val;
                }
                
                if (!el.dataset.autoSaveBound) {
                    this.attachAutoSave(el);
                    el.dataset.autoSaveBound = "true";
                }
            }
        });
    
        if (this.monacoCtrl) {
            this.monacoCtrl.setValues(request.pre_script, request.post_script);
        }
    
        setTimeout(() => {
            this.isApplyingData = false;
        }, 100); 
    }

    
    
}

