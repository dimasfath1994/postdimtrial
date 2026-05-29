// js/ui/request-ui.js

export class RequestUI {
    /**
     * Render item request ke dalam list (di sidebar atau di dalam folder)
     * @param {Object} request - Objek request dari backend
     * @param {HTMLElement} container - Container tempat request akan diletakkan
     * @param {Function} onDelete - Callback saat user memilih delete dari context menu
     */
    static renderRequestItem(request, container, handlers, onOpenTab) {
        const item = document.createElement("div");
        item.className = "request-item";
        item.dataset.id = request.id;
        
        // Menampilkan method dengan warna (asumsi CSS sudah ada untuk method-nya)
        item.innerHTML = `
            <div class="request-row" style="display: flex; align-items: center; padding: 5px; cursor: pointer;">
                <span class="method-badge ${request.method}" style="margin-right: 8px; font-weight: bold; font-size: 10px;">
                    ${request.method}
                </span>
                <span class="name" style="font-size: 13px;">${request.name}</span>
            </div>
        `;

        // Event klik untuk membuka (load ke tab)
        item.addEventListener("click", () => {
            console.log("Opening request:", request.id);
            //document.dispatchEvent(new CustomEvent("open-request-tab", { detail: request }));
            onOpenTab(request);
        });

        // Event Klik Kanan untuk Context Menu (CRUD)
        item.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            this.showRequestContextMenu(e, request, handlers);
        });

        container.appendChild(item);
    }
    

    /**
     * Render tab baru di topbar
     */
    static renderTab(request) {
        const tabsContainer = document.getElementById("tabs");
        // Hindari duplikasi tab jika sudah ada
        if (document.querySelector(`.tab-item[data-id="${request.id}"]`)) return;

        const tab = document.createElement("div");
        tab.className = "tab-item";
        tab.dataset.id = request.id;
        tab.innerHTML = `
            <span>${request.name}</span>
            <button class="close-tab" style="margin-left: 5px;">x</button>
        `;

        // Close tab event
        tab.querySelector('.close-tab').onclick = (e) => {
            e.stopPropagation();
            tab.remove();
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

    /**
     * Context Menu untuk Request (Delete/Rename)
     */
    static showRequestContextMenu(e, request, handlers) {
        const existingMenu = document.querySelector('.context-menu');
        if (existingMenu) existingMenu.remove();

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        Object.assign(menu.style, {
            position: 'fixed',
            left: `${e.clientX}px`,
            top: `${e.clientY}px`,
            background: '#252526',
            border: '1px solid #454545',
            padding: '5px 0',
            zIndex: '2000',
            color: '#fff',
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
        });

        menu.innerHTML = `
            <div class="menu-item" id="ctx-rename" style="padding:8px 15px;">Rename</div>
            <div class="menu-item" id="ctx-duplicate" style="padding:8px 15px;">Duplicate</div>
            <div class="menu-item" id="ctx-pin" style="padding:8px 15px;">${request.pinned ? 'Unpin' : 'Pin'}</div>
            <div class="menu-item" id="ctx-close" style="padding:8px 15px;">Close Tab</div>
            <div class="menu-item" id="ctx-delete" style="padding:8px 15px; color:#f44336;">Delete</div>
        `;

        document.body.appendChild(menu);

        // Event Handlers
        menu.querySelector('#ctx-rename').onclick = () => {
            const newName = prompt("Rename request:", request.name);
            if (newName) handlers.onRename(request.id, newName);
            menu.remove();
        };

        menu.querySelector('#ctx-duplicate').onclick = () => {
            handlers.onDuplicate(request);
            menu.remove();
        };

        menu.querySelector('#ctx-pin').onclick = () => {
            handlers.onPin(request.id, !request.pinned);
            menu.remove();
        };

        menu.querySelector('#ctx-close').onclick = () => {
            this.removeRequestElement(request.id);
            menu.remove();
        };

        menu.querySelector('#ctx-delete').onclick = () => {
            handlers.onDelete(request.id);
            menu.remove();
        };

        document.addEventListener('click', () => menu.remove(), { once: true });
    }

    
}