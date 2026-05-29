// js/collab/controller/tab-controller.js

import { RequestUI } from "../ui/request-ui.js"; 

export class TabController {
    constructor(ui) {
        this.tabs = [];
        this.activeTabId = null;
    }

    openTab(request) {
        if (!this.tabs.find(t => t.id === request.id)) {
            this.tabs.push(request);
            RequestUI.renderTab(request); // Panggil fungsi UI Anda
        }
        this.switchTab(request.id);
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

    loadToEditor(request) {
        document.getElementById("method").value = request.method || "GET";
        document.getElementById("url").value = request.url || "";
        document.getElementById("body").value = request.body || "";
        // ... (isi field lainnya: headers, auth, dll)
    }
}