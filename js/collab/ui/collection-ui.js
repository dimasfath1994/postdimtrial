// collection-ui.js

/**
 * Merender daftar koleksi ke dalam elemen container sidebar
 * @param {HTMLElement} container - Elemen container di sidebar
 * @param {Array} collections - Array data koleksi
 * @param {Object} handlers - Callback untuk aksi (rename, delete, dll)
 */

export function renderCollectionSidebar(container, collections, handlers) {
    container.innerHTML = ''; 
    
    collections.forEach(col => {
        const item = document.createElement('div');
        item.className = 'collection-item';
        item.dataset.id = col.id;
        
        item.innerHTML = `
            <div class="col-header">
                <span class="toggle-icon" style="display:inline-block; width: 15px; cursor: pointer;">▶</span>
                <span class="col-name" style="cursor: pointer;">${col.name}</span>
            </div>
            <div class="collection-body" id="collection-body-${col.id}" style="display:none;">
                <div id="requests-container-${col.id}" class="requests-list" style="padding-left: 20px;"></div>
                <div id="child-list-${col.id}" class="child-list" style="padding-left: 20px;"></div>
            </div>
        `;

        item.querySelector('.col-header').onclick = (e) => {
            e.stopPropagation();
            toggleExpand(item, col, handlers);
        };

        item.querySelector('.col-name').oncontextmenu = (e) => {
            e.preventDefault();
            handlers.onOpenMenu(e, col);
        };

        container.appendChild(item);
    });
}

function toggleExpand(item, col, handlers) {
    const icon = item.querySelector('.toggle-icon');
    const body = item.querySelector(`#collection-body-${col.id}`);
    const isCurrentlyExpanded = body.style.display === 'block';

    if (isCurrentlyExpanded) {
        // COLLAPSE
        icon.textContent = '▶';
        body.style.display = 'none';

        // --- INI KUNCINYA ---
        // Kita paksa cari SEMUA elemen yang merupakan anak dari item
        // DAN buang semuanya, tidak peduli dia ada di dalam body atau "bocor" keluar
        const allChildren = item.querySelectorAll(':scope > .collection-body, :scope > .child-list');
        allChildren.forEach(el => {
            // Hapus isi di dalamnya
            el.innerHTML = '';
        });
    } else {
        // EXPAND
        icon.textContent = '▼';
        body.style.display = 'block';
        
        if (handlers.requestCtrl) handlers.requestCtrl.loadRequestsByCollection(col.id);
        if (handlers.onExpand) handlers.onExpand(col.id, item);
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

