/**
 * TabDraftController.js
 * Bertindak sebagai pusat kendali untuk manajemen tab (draft maupun request asli).
 */
import { RequestUI } from "../ui/request-ui.js"; 

export class TabDraftController {
    constructor(State, handlers) {
        this.State = State;
        this.handlers = handlers; // Berisi logic save/send/update
        this.tabs = [];           // Array tab dikelola di sini
        this.activeTabId = null;
    }

    /**
     * Membuka tab baru (Draft atau Existing)
     */
    openTab(request) {
        // 1. Tentukan apakah data dari state (asli) atau data baru (draft)
        const isDraft = request.id.startsWith('draft_');
        const freshData = isDraft 
            ? request 
            : (this.State.requests.find(r => r.id === request.id) || request);
        
        // 2. Cek apakah tab sudah ada
        const tabItem = this.tabs.find(t => t.id === freshData.id);
        
        if (!tabItem) {
            // Tab baru: push ke array & render
            this.tabs.push(freshData);
            
            RequestUI.renderTab(
                freshData, 
                (id) => this.switchTab(id), 
                (id) => this.closeTab(id),
                this.handlers
            );
        } else {
            // Tab sudah ada: update data agar tidak basi
            Object.assign(tabItem, freshData);
            this.updateTabUI(freshData);
        }
        
        // 3. Switch ke tab tersebut
        this.switchTab(freshData.id);
    }

    /**
     * Mengelola pergantian tab aktif
     */
    switchTab(tabId) {
        this.activeTabId = tabId;
        
        // Update visual di DOM
        document.querySelectorAll('.tab-item').forEach(el => {
            el.classList.toggle('active', el.dataset.id === String(tabId));
        });
        
        // Notify sistem lain bahwa tab berubah
        window.dispatchEvent(new CustomEvent('request-tab-switched', { 
            detail: { requestId: tabId } 
        }));
    }

    /**
     * Menutup tab dengan proteksi draft
     */
    closeTab(tabId) {
        const tab = this.tabs.find(t => t.id === tabId);
        if (!tab) return;

        // Proteksi draft
        if (tab.is_draft) {
            if (!confirm("Request ini belum disimpan. Apakah Anda yakin ingin menutupnya?")) {
                return;
            }
        }

        // Hapus dari array
        this.tabs = this.tabs.filter(t => t.id !== tabId);
        
        // Hapus dari DOM
        const tabEl = document.querySelector(`.tab-item[data-id="${tabId}"]`);
        if (tabEl) tabEl.remove();
        
        // Jika tab yang ditutup adalah yang aktif, pindah ke tab lain
        if (this.activeTabId === tabId && this.tabs.length > 0) {
            this.switchTab(this.tabs[this.tabs.length - 1].id);
        }
    }

    /**
     * Update ID tab (dipanggil saat draft berhasil di-save ke DB)
     */
    updateTabId(oldId, newId) {
        const tab = this.tabs.find(t => t.id === oldId);
        if (tab) {
            tab.id = newId;
            tab.is_draft = false; // Status berubah dari draft ke permanen
            
            const tabEl = document.querySelector(`.tab-item[data-id="${oldId}"]`);
            if (tabEl) tabEl.dataset.id = newId;
            
            if (this.activeTabId === oldId) this.activeTabId = newId;
        }
    }

    /**
     * Update nama tab di UI
     */
    updateTabUI(data) {
        const tabEl = document.querySelector(`.tab-item[data-id="${data.id}"]`);
        if (tabEl) {
            tabEl.querySelector('.tab-name').textContent = data.name;
        }
    }
}