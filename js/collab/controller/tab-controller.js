// js/collab/controller/tab-controller.js

import { RequestUI } from "../ui/request-ui.js"; 

export class TabController {
    constructor(ui, handlers) {
        this.tabs = [];
        this.activeTabId = null;
        this.handlers = handlers;
        this.getRequestData = null;
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
        
        // Update Highlight UI Tabs
        document.querySelectorAll('.tab-item').forEach(el => 
            el.classList.toggle('active', el.dataset.id == id));
            
        // Load data ke Editor Tengah
        this.loadToEditor(request);
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

    loadToEditor(request) {
        document.getElementById("method").value = request.method || "GET";
        document.getElementById("url").value = request.url || "";
        document.getElementById("body").value = request.body || "";
        // ... (isi field lainnya: headers, auth, dll)
    }
}