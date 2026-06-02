// js/collab/controller/tab-controller.js

import { RequestUI } from "../ui/request-ui.js"; 

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


    closeTab(id) {
        // 1. Hapus dari array state
        this.tabs = this.tabs.filter(t => t.id !== id);
        
        // 2. Hapus elemen DOM-nya (PENTING!)
        const tabEl = document.querySelector(`.tab-item[data-id="${id}"]`);
        if (tabEl) tabEl.remove();
        
        // 3. Reset editor jika tab yang dihapus sedang aktif
        if (this.activeTabId === id) {
            this.activeTabId = null;
            this.clearEditor();
        }
        console.log("Tab closed, current tabs:", this.tabs);
    }

    clearEditor() {
        document.getElementById("method").value = "GET";
        document.getElementById("url").value = "";
        document.getElementById("body").value = "";
    }

    switchTab(id) {
        this.activeTabId = id;
        const request = this.tabs.find(t => t.id === id);
        
        // 1. Update Highlight UI Tabs
        document.querySelectorAll('.tab-item').forEach(el => 
            el.classList.toggle('active', el.dataset.id == id));
            
        // 2. Load data ke Editor Tengah
        this.loadToEditor(request);
    
        // 3. Render HANYA panel yang sedang aktif di UI (tidak memaksa buka hidden)
        // Cek panel mana yang tidak memiliki class 'hidden'
        const activePanel = document.querySelector('.tab-panel:not(.hidden)');
        const activePanelType = activePanel ? activePanel.getAttribute('data-panel') : 'params';
    
        this.refreshActivePanel(activePanelType);
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

