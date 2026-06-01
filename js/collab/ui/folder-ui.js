import { RequestUI } from './request-ui.js';
/**
 * Merender daftar folder/request ke dalam elemen container (child-list)
 * @param {HTMLElement} parentElement - Elemen tempat list akan disisipkan
 * @param {Array} folders - Data folder
 * @param {Array} requests - Data request
 * @param {Object} handlers - Callback untuk aksi
 */
/**
 * Merender daftar folder/request ke dalam elemen container (child-list)
 */


export function renderFolderChildren(parentElement, folders, requests, handlers) {
    // 1. Cari container child-list di scope parentElement
    let childList = parentElement.querySelector(':scope > .child-list');
    
    // 2. Logika Toggle (Jika sudah ada, cukup tampilkan/sembunyikan)

    if (!childList) {
        childList = document.createElement('div');
        childList.className = 'child-list';
        childList.style.paddingLeft = '20px';
        childList.style.display = 'block';
        parentElement.appendChild(childList);
    } else {
        // Jika sudah ada, cukup bersihkan isinya
        childList.innerHTML = '';
    }

    // 3. Jika folder dan request sama-sama kosong, abaikan
    if ((!folders || folders.length === 0) && (!requests || requests.length === 0)) {
        return;
    }
    

    // 4. Buat container childList baru


    // 5. Render Requests (Muncul di dalam folder/level saat ini)
    if (requests && requests.length > 0) {
        requests.forEach(req => {
            const reqItem = document.createElement('div');
            reqItem.className = 'request-item';
            reqItem.dataset.id = req.id;
            
            // Perbaikan Defensif: Mengecek apakah fungsi ada sebelum memanggil
            if (typeof RequestUI.renderRequestItem === 'function') {
                RequestUI.renderRequestItem(req, reqItem, handlers.requestHandlers, handlers.onOpenTab);
            } else {
                // Fallback jika fungsi renderRequestItem tidak ditemukan
                console.error("Fungsi RequestUI.renderRequestItem tidak ditemukan!");
                reqItem.innerHTML = `<span style="padding: 5px; color: #555;">${req.name || 'Unnamed Request'}</span>`;
            }
            
            childList.appendChild(reqItem);
        });
    }

    // 6. Render Folders
    folders.forEach(folder => {
        const item = document.createElement('div');
        item.className = 'folder-item';
        item.dataset.id = folder.id; 
        item.innerHTML = `
            <div class="folder-header" style="cursor: pointer; display: flex; align-items: center; padding: 4px 0;">
                <span class="toggle-icon" style="width: 20px;">▶</span>
                <span class="folder-name" data-id="${folder.id}">📁 ${folder.name}</span>
            </div>
        `;
        childList.appendChild(item);
    });

    // 7. GLOBAL EVENT DELEGATION
    if (!window.hasFolderGlobalListeners) {
        document.addEventListener('click', (e) => {
            const header = e.target.closest('.folder-header');
            if (!header) return;
            
            const item = header.closest('.folder-item');
            if (!item) return;

            const existingSub = item.querySelector(':scope > .child-list');
            const toggleIcon = header.querySelector('.toggle-icon');
            
            if (existingSub) {
                const isHidden = existingSub.style.display === 'none';
                existingSub.style.display = isHidden ? 'block' : 'none';
                if (toggleIcon) toggleIcon.textContent = isHidden ? '▼' : '▶';
            } else {
                if (toggleIcon) toggleIcon.textContent = '▼';
                handlers.onExpand(item.dataset.id, item);
            }
        });

        document.addEventListener('contextmenu', (e) => {
            const nameEl = e.target.closest('.folder-name');
            if (!nameEl) return;
            e.preventDefault();
            handlers.onOpenMenu(e, { 
                id: nameEl.dataset.id, 
                name: nameEl.textContent.replace('📁 ', '') 
            });
        });

        window.hasFolderGlobalListeners = true;
    }
}



/**
 * Menampilkan context menu khusus folder
 */
export function showFolderContextMenu(e, folder, handlers) {
    // 1. Hapus menu lama jika masih ada (mencegah penumpukan)
    const existingMenu = document.querySelector('.context-menu');
    if (existingMenu) existingMenu.remove();

    // 2. Buat elemen menu
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    Object.assign(menu.style, {
        position: 'fixed',
        left: `${e.clientX}px`,
        top: `${e.clientY}px`,
        background: '#252526',
        border: '1px solid #454545',
        padding: '5px 0',
        zIndex: '1000',
        borderRadius: '4px',
        color: '#fff',
        cursor: 'pointer'
    });

    menu.innerHTML = `
        <div class="menu-item" id="ctx-rename" style="padding:5px 15px;">Rename</div>
        <div class="menu-item" id="ctx-add-folder" style="padding:5px 15px;">Add Sub-Folder</div>
        <div class="menu-item" id="ctx-add-request" style="padding:5px 15px;">Add Request</div>
        <div class="menu-item" id="ctx-delete" style="padding:5px 15px; color:#f44336;">Delete</div>
    `;

    document.body.appendChild(menu);

    // 3. Fungsi Helper untuk menutup menu dengan aman
    const closeMenu = () => {
        if (menu && menu.parentNode) {
            menu.remove();
        }
    };

    // 4. Binding Event dengan Closure yang benar
    menu.querySelector('#ctx-rename').onclick = () => { 
        handlers.onRename(folder.id); 
        closeMenu(); 
    };

    menu.querySelector('#ctx-add-folder').onclick = () => { 
        handlers.onAddFolder(folder.id); 
        closeMenu(); 
    };

    menu.querySelector('#ctx-delete').onclick = () => { 
        handlers.onDelete(folder.id); 
        closeMenu(); 
    };

    menu.querySelector('#ctx-add-request').onclick = () => {
        // Menggunakan handler yang di-inject dari FolderController
        if (handlers.onAddRequest) {
            handlers.onAddRequest(folder.id, folder.collection_id);
        } else {
            console.error("Handler onAddRequest tidak ditemukan!");
        }
        closeMenu(); 
    };

    // 5. Tutup jika klik di luar area menu
    document.addEventListener('click', closeMenu, { once: true });
}

