// js/ui/menu-ui.js

export class MenuUI {
    /**
     * @param {Event} e - Mouse event dari contextmenu
     * @param {Object} item - Data request yang sedang diklik
     * @param {Object} handlers - Kumpulan fungsi {onRename, onDuplicate, onPin, onDelete}
     * @param {Function} [onCloseTab] - Opsional, jika menu dipanggil dari Tab
     */
    static show(e, item, handlers, onCloseTab = null) {
        // 1. Bersihkan menu yang terbuka sebelumnya
        const existing = document.getElementById('context-menu');
        if (existing) existing.remove();

        // 2. Buat elemen menu
        const menu = document.createElement('div');
        menu.id = 'context-menu';
        menu.className = 'context-menu';
        
        // Style dasar (bisa dipindahkan ke CSS nanti)
        Object.assign(menu.style, {
            position: 'fixed',
            left: `${e.clientX}px`,
            top: `${e.clientY}px`,
            background: '#252526',
            border: '1px solid #454545',
            padding: '5px 0',
            zIndex: '9999',
            color: '#fff',
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
            borderRadius: '4px',
            minWidth: '150px'
        });

        // 3. Render items secara dinamis
        menu.innerHTML = `
            <div class="menu-item" data-action="rename" style="padding:8px 15px; cursor:pointer;">Rename</div>
            <div class="menu-item" data-action="duplicate" style="padding:8px 15px; cursor:pointer;">Duplicate</div>
            <div class="menu-item" data-action="pin" style="padding:8px 15px; cursor:pointer;">${item.pinned ? 'Unpin' : 'Pin'}</div>
            ${onCloseTab ? `<div class="menu-item" data-action="close" style="padding:8px 15px; cursor:pointer; border-top:1px solid #444;">Close Tab</div>` : ''}
            <div class="menu-item" data-action="delete" style="padding:8px 15px; cursor:pointer; color:#f93e3e;">Delete</div>
        `;

        // 4. Event Delegation untuk action (Re-useable!)
        menu.onclick = (ev) => {
            const action = ev.target.dataset.action;
            if (!action) return;

            // Eksekusi fungsi dari handlers
            switch(action) {
                case 'rename': 
                    const newName = prompt("New Name:", item.name);
                    if (newName) handlers.onRename(item.id, newName);
                    break;
                case 'duplicate': 
                    handlers.onDuplicate(item); 
                    break;
                case 'pin': 
                    handlers.onPin(item.id, !item.pinned); 
                    break;
                case 'delete': 
                    handlers.onDelete(item.id); 
                    break;
                case 'close': 
                    if (onCloseTab) onCloseTab(item.id); 
                    break;
            }
            menu.remove();
        };

        document.body.appendChild(menu);
        
        // 5. Auto close saat klik di luar area menu
        const closeMenu = () => {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }
}