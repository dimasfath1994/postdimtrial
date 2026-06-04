// js/collab/controller/tab-controller.js

import { RequestUI } from "../ui/request-ui.js"; 
import { ResponseHandler } from "../services/response-handler.js"; 

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
        // 1. Ambil data terbaru dari State (menggunakan getter yang kita buat tadi)
        const freshData = (this.getRequestData && this.getRequestData(request.id)) || request;
        
        // 2. Cek apakah tab sudah ada
        const tabItem = this.tabs.find(t => t.id === freshData.id);
        
        if (!tabItem) {
            // Tab belum pernah dibuka, push ke array dan render
            this.tabs.push(freshData);
            RequestUI.renderTab(
                freshData, 
                (id) => this.switchTab(id), 
                (id) => this.closeTab(id),
                this.handlers
            );
        } else {
            // Tab SUDAH ada, update data di array lokal agar tidak basi
            Object.assign(tabItem, freshData);
            
            // Opsional: Update juga textContent di DOM jika nama berubah
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
        const request = this.tabs.find(t => t.id === id);
        
        // 1. Update Highlight UI Tabs
        document.querySelectorAll('.tab-item').forEach(el => 
            el.classList.toggle('active', el.dataset.id == id));
            
        // 2. Load data ke Editor Tengah
        this.loadToEditor(request);

        // --- TAMBAHAN: SWITCH RESPONSE ---
        // let a = this.getResponseElements();
        // console.log('ISI THIS TABS', a);
        // if (request.lastResponse) {
        //     // Jika tab ini pernah punya response, tampilkan kembali
        //     ResponseHandler.render(request.lastResponse);
        // } else {
        //     // Jika belum pernah atau request baru, bersihkan response
        //     this.resetResponse();
        // }
    
        // 3. Render Panel Aktif TERLEBIH DAHULU (Pastikan DOM tersedia)
        const activePanel = document.querySelector('.tab-panel:not(.hidden)');
        const activePanelType = activePanel ? activePanel.getAttribute('data-panel') : 'params';
        this.refreshActivePanel(activePanelType);
    
        // 4. Barulah SYNC UI Body Mode (Setelah semua panel dirender)
        // Gunakan requestAnimationFrame untuk memastikan DOM benar-benar sudah siap
        requestAnimationFrame(() => {
            if (request && typeof window.syncBodyModeUI === 'function') {
                let mode = request.body_mode || 'none';
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

