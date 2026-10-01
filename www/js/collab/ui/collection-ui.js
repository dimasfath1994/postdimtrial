// collection-ui.js
import { escapeHtml } from './html-escape.js';

/**
 * Merender daftar koleksi ke dalam elemen container sidebar
 * @param {HTMLElement} container - Elemen container di sidebar
 * @param {Array} collections - Array data koleksi
 * @param {Object} handlers - Callback untuk aksi (rename, delete, dll)
 */

export function renderCollectionSidebar(container, collections, handlers) {
    if (!container) return;

    container.style.display = 'block';
    container.innerHTML = ''; 
    
    collections.forEach(col => {
        const item = document.createElement('div');
        item.className = 'collection-item';
        item.style.display = 'block';
        item.dataset.id = col.id;
        
        item.innerHTML = `
            <div class="col-header">
                <span class="toggle-icon" style="display:inline-block; width: 15px; cursor: pointer;">▶</span>
                <span class="col-name" style="cursor: pointer;">${escapeHtml(col.name)}</span>
            </div>
            <div class="collection-body" id="collection-body-${escapeHtml(col.id)}" style="display:none;">
                <div id="requests-container-${escapeHtml(col.id)}" class="requests-list" style="padding-left: 20px;"></div>
                <div id="child-list-${escapeHtml(col.id)}" class="child-list" style="padding-left: 20px;"></div>
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
    const isCurrentlyExpanded = body && body.dataset.expanded === 'true';

    if (isCurrentlyExpanded) {
        icon.textContent = '▶';
        body.style.display = 'none';
        body.dataset.expanded = 'false';
        return;
    }

    icon.textContent = '▼';
    body.style.display = 'block';
    body.dataset.expanded = 'true';

    if (handlers.requestCtrl) handlers.requestCtrl.loadRequestsByCollection(col.id);
    if (handlers.onExpand) handlers.onExpand(col.id, item);
}
export function setupCollectionActions(ctrl) {
    const btn = document.getElementById('newCollection');
    
    if (btn) {
        btn.onclick = async () => {
           const name = await window.customPrompt("Enter collection name:");
            if (name) {
                await ctrl.createCollection(name);
            }
        };
    }
}

