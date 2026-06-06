// js/collab/controller/tab-controller.js

import { RequestUI } from "../ui/request-ui.js"; 
import { DataBridge } from './bridge.js'; // Pastikan import ini

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

    async closeTab(id) {
        const sid = String(id);
        const closedTabIndex = this.tabs.findIndex(t => String(t.id) === sid);
        
        if (closedTabIndex === -1) return;
    
        // 1. Logic "Save Changes?" (Postman Style)
        if (sid.startsWith('draft_')) {
            // Cek apakah ada data (bisa dikembangkan jadi pengecekan isDirty yang asli)
            const draftData = DataBridge.getAll(sid);
            const isDirty = draftData && (draftData.url !== '' || draftData.body !== null);
            
            if (isDirty) {
                const userChoice = confirm("Do you want to save this request?");
                if (userChoice) {
                    // Panggil fungsi save yang sudah ada di sistemmu
                    // Contoh: await this.saveDraftToDatabase(sid);
                    console.log("Saving request...");
                }
            }
            
            // Cukup panggil DataBridge.cleanup untuk menghapus data di memori
            DataBridge.cleanup(sid);
        }
    
        // 2. Tentukan tab mana yang akan aktif selanjutnya
        let nextActiveId = null;
        if (this.activeTabId === sid) {
            if (this.tabs.length > 1) {
                const newIndex = closedTabIndex === 0 ? 1 : closedTabIndex - 1;
                nextActiveId = this.tabs[newIndex].id;
            }
        } else {
            nextActiveId = this.activeTabId;
        }
    
        // 3. Hapus dari State & DOM
        this.tabs = this.tabs.filter(t => String(t.id) !== sid);
        const tabEl = document.querySelector(`.tab-item[data-id="${sid}"]`);
        if (tabEl) tabEl.remove();
    
        // 4. Pindah ke tab berikutnya atau bersihkan editor
        if (nextActiveId) {
            this.switchTab(nextActiveId);
        } else {
            this.activeTabId = null;
            this.clearEditor();
            this.clearResponse();
        }
    
        console.log("Tab closed, switched to:", nextActiveId);
    }

    clearEditor() {
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
        
        // 1. Ambil data paling fresh dari DataBridge (Bridge akan memilih: Local vs State)
        // Kita gunakan getAll agar semua properti (url, method, body, dll) terambil
        const baseRequest = this.tabs.find(t => String(t.id) === String(id));
        const freshData = { 
            ...baseRequest, 
            ...(DataBridge.getAll(id) || {}) 
        };
        
        // 2. Update Highlight UI Tabs
        document.querySelectorAll('.tab-item').forEach(el => 
            el.classList.toggle('active', String(el.dataset.id) === String(id)));
                
        // 3. Load data ke Editor Tengah (Gunakan freshData agar editor tidak menampilkan data lama)
        this.loadToEditor(freshData);
    
        // 4. Render Panel Aktif
        const activePanel = document.querySelector('.tab-panel:not(.hidden)');
        const activePanelType = activePanel ? activePanel.getAttribute('data-panel') : 'params';
        this.refreshActivePanel(activePanelType);
    
        // 5. Sync UI Body Mode
        requestAnimationFrame(() => {
            if (freshData && typeof window.syncBodyModeUI === 'function') {
                let mode = freshData.body_mode || 'none';
                if (mode === 'formdata') mode = 'form-data'; 
                
                console.log("[DEBUG] Syncing mode setelah UI siap:", mode);
                window.syncBodyModeUI(mode, true);
            }
        });
    
        window.dispatchEvent(new CustomEvent('request-tab-switched', {
            detail: { requestId: id },
        }));
    }
    refreshActivePanel(panelType) {
        if (!this.activeTabId) return;
    
        const id = this.activeTabId;
        if (panelType === 'params') {
            const paramsBox = document.getElementById('paramsBox');
            if (paramsBox) this.paramCtrl.init(id, paramsBox);
        } else if (panelType === 'headers') {
            const headersBox = document.getElementById('headersBox');
            if (headersBox) this.headerCtrl.init(id, headersBox);
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
        // 1. Set flag agar attachAutoSave tahu kita sedang loading data, bukan user yang mengetik
        this.isApplyingData = true;
    
        const fields = ['method', 'url', 'body', 'authType', 'authValue'];
        
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                // Karena di request object fieldnya adalah auth_type, 
                // kita harus map ke ID elemen authType (dan sebaliknya)
                if (id === 'authType') el.value = request.auth_type || 'none';
                else if (id === 'authValue') el.value = request.auth_value || '';
                else if (id === 'body') el.value = request.body || '';
                //else if (id === 'preEditor' || "postEditor") this.scriptCtrl.setScripts(request.pre_script, request.post_script);
                else el.value = request[id] || "";
                
                // Pasang listener auto-save
                if (!el.dataset.autoSaveBound) {
                    this.attachAutoSave(el);
                    el.dataset.autoSaveBound = "true";
                }
            }

        });
        // 2. Set nilai Monaco secara terpisah melalui controller
        if (this.monacoCtrl) {
            this.monacoCtrl.setValues(request.pre_script, request.post_script);
        }
    
        // 2. Beri waktu sedikit sebelum mengizinkan auto-save lagi
        setTimeout(() => {
            this.isApplyingData = false;
        }, 100); 
    }

    
    
}

