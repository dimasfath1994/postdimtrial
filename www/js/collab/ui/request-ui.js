// js/ui/request-ui.js
import { MenuUI } from "./menu-ui.js"; 

export class RequestUI {
    /**
     * Render item request ke dalam list (di sidebar atau di dalam folder)
     * @param {Object} request - Objek request dari backend
     * @param {HTMLElement} container - Container tempat request akan diletakkan
     * @param {Function} onDelete - Callback saat user memilih delete dari context menu
     */
    static renderRequestItem(request, container, handlers, onOpenTab) {
        const isDraft = String(request.id).startsWith('draft_');
        const item = document.createElement("div");
        //item.className = "request-item";
        item.className = `request-item ${isDraft ? 'draft-item' : ''}`;
        item.dataset.id = request.id;
        
        item.innerHTML = `
        <div class="request-row" style="display: flex; align-items: center; padding: 5px; cursor: pointer;">
            <span class="method-badge ${request.method}" style="margin-right: 8px; font-weight: bold; font-size: 10px;">
                ${request.method}
            </span>
            <span class="name" style="font-size: 13px;">
                ${request.name} ${isDraft ? '<small style="color: gray;">(Draft)</small>' : ''}
            </span>
        </div>
    `;

        item.addEventListener("click", () => onOpenTab(request));

        // Klik Kanan menggunakan MenuUI (Sidebar tidak butuh onCloseTab, jadi kirim null)
        item.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            MenuUI.show(e, request, handlers, null);
        });

        container.appendChild(item);
    }

    /**
     * Render tab baru di topbar
     */
    static renderTab(request, onSwitch, onClose, handlers) {
        const tabsContainer = document.getElementById("tabs");
        const isDraft = String(request.id).startsWith('draft_');

        if (document.querySelector(`.tab-item[data-id="${request.id}"]`)) return;
    
        const tab = document.createElement("div");
        //tab.className = "tab-item";
        tab.className = `tab-item ${isDraft ? 'tab-draft' : ''}`;
        tab.dataset.id = request.id;
        tab.innerHTML = `
        <span class="tab-name">${request.name}</span>
        <button class="close-tab" title="${isDraft ? 'Hapus Draft' : 'Tutup'}">×</button>
    `;
    
        // Event Klik untuk Pindah Tab
        tab.onclick = () => onSwitch(request.id);

        // Event Klik Kanan untuk Menu di Tab
        tab.oncontextmenu = (e) => {
            e.preventDefault();
            // Kirim onCloseTab agar MenuUI tahu cara menutup tab
            MenuUI.show(e, request, handlers, (id) => {
                tab.remove();
                onClose(id);
            });
        };
    
        // Event Klik untuk Close Tab (Tombol X)
        tab.querySelector('.close-tab').onclick = (e) => {
            e.stopPropagation();
            tab.remove();
            onClose(request.id);
        };
    
        tabsContainer.appendChild(tab);
        return tab;
    }

    /**
     * Helper untuk menghapus elemen dari DOM
     */
    static removeRequestElement(requestId) {
        const el = document.querySelector(`.request-item[data-id="${requestId}"]`);
        if (el) el.remove();
        
        const tab = document.querySelector(`.tab-item[data-id="${requestId}"]`);
        if (tab) tab.remove();
    }


 

    
}