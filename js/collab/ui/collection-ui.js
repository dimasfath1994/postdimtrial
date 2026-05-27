// collection-ui.js

/**
 * Merender daftar koleksi ke dalam elemen container sidebar
 * @param {HTMLElement} container - Elemen container di sidebar
 * @param {Array} collections - Array data koleksi
 * @param {Object} handlers - Callback untuk aksi (rename, delete, dll)
 */
// js/collab/ui/collection-ui.js
// js/collab/ui/collection-ui.js

// js/collab/ui/collection-ui.js

export function renderCollectionSidebar(container, collections, handlers) {
    container.innerHTML = ''; 
    
    collections.forEach(col => {
        const item = document.createElement('div');
        item.className = 'collection-item';
        item.dataset.id = col.id;
        
        item.innerHTML = `
            <div class="col-header">
                <span class="toggle-icon">▶</span>
                <span class="col-name">${col.name}</span>
            </div>
        `;

        // Event: Klik panah untuk expand/collapse
        item.querySelector('.toggle-icon').onclick = (e) => {
            e.stopPropagation();
            toggleExpand(item, col, handlers);
        };

        // Event: Klik kanan pada nama koleksi untuk memunculkan menu (pengganti titik tiga)
        item.querySelector('.col-name').oncontextmenu = (e) => {
            e.preventDefault();
            handlers.onOpenMenu(e, col);
        };

        container.appendChild(item);
    });
}

function toggleExpand(item, col, handlers) {
    const icon = item.querySelector('.toggle-icon');
    const isExpanded = icon.textContent === '▼';
    
    // Toggle icon
    icon.textContent = isExpanded ? '▶' : '▼';
    
    // Panggil handler untuk load isi koleksi jika belum di-expand
    if (!isExpanded) {
        handlers.onExpand(col.id, item);
    } else {
        // Hapus child list jika sudah ada
        const childList = item.querySelector('.child-list');
        if (childList) childList.remove();
    }
}

export function setupCollectionActions(ctrl) {
    const btn = document.getElementById('newCollection');
    
    if (btn) {
        btn.onclick = async () => {
            const name = prompt("Enter collection name:");
            if (name) {
                await ctrl.createCollection(name);
            }
        };
    }
}

/**
 * Menampilkan context menu (Rename, Delete, Export)
 */
function showContextMenu(e, col, handlers) {
    // Implementasi menu popup sederhana atau gunakan menu custom
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.position = 'fixed';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    
    menu.innerHTML = `
        <div id="ctx-rename">Rename</div>
        <div id="ctx-export">Export Postman</div>
        <div id="ctx-add-folder">Add Folder</div>
        <div id="ctx-add-request">Add Request</div>
        <div id="ctx-delete" style="color:red">Delete</div>
    `;

    document.body.appendChild(menu);

    menu.querySelector('#ctx-rename').onclick = () => {
        handlers.onRename(col.id, col.name);
        menu.remove();
    };
    menu.querySelector('#ctx-delete').onclick = () => {
        handlers.onDelete(col.id);
        menu.remove();
    };
    menu.querySelector('#ctx-export').onclick = () => {
        handlers.onExport(col.id);
        menu.remove();
    };

    // Close menu saat klik di luar
    document.addEventListener('click', () => menu.remove(), { once: true });
}