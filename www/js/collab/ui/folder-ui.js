import { RequestUI } from './request-ui.js';
import { escapeHtml } from './html-escape.js';
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
    const isCollection = parentElement.classList.contains('collection-item');
    const childContainer = isCollection
        ? parentElement.querySelector(':scope > .collection-body')
        : parentElement;
    let childList = isCollection
        ? childContainer?.querySelector(':scope > .child-list')
        : parentElement.querySelector(':scope > .child-list');
    
    // 2. Logika Toggle (Jika sudah ada, cukup tampilkan/sembunyikan)

    if (!childList) {
        childList = document.createElement('div');
        childList.className = 'child-list';
        childList.style.paddingLeft = '20px';
        childList.style.display = 'block';
        childContainer?.appendChild(childList);
    } else {
        // Jika sudah ada, cukup bersihkan isinya
        childList.innerHTML = '';
    }
    childList.dataset.loaded = 'true';

    // 3. Jika folder dan request sama-sama kosong, abaikan
    if ((!folders || folders.length === 0) && (!requests || requests.length === 0)) {
        return;
    }
    

    // 4. Buat container childList baru


    // Root requests already have their own list in the collection body.
    if (!isCollection && requests && requests.length > 0) {
        requests.forEach(req => {
            if (typeof RequestUI.renderRequestItem === 'function') {
                RequestUI.renderRequestItem(req, childList, handlers.requestHandlers, handlers.onOpenTab);
            } else {
                console.error("Fungsi RequestUI.renderRequestItem tidak ditemukan!");
            }
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
                <span class="folder-name" data-id="${escapeHtml(folder.id)}">📁 ${escapeHtml(folder.name)}</span>
            </div>
        `;
        
        // Pastikan ada container child-list kosong di dalam folder-item untuk sub-folder/request berikutnya
        const subChildList = document.createElement('div');
        subChildList.className = 'child-list';
        subChildList.style.paddingLeft = '20px';
        subChildList.style.display = 'none'; // Default tertutup sebelum di-expand
        item.appendChild(subChildList);

        item.querySelector('.folder-header').addEventListener('click', async (event) => {
            event.stopPropagation();
            const toggleIcon = item.querySelector('.toggle-icon');
            const isHidden = subChildList.style.display === 'none';
            subChildList.style.display = isHidden ? 'block' : 'none';
            if (toggleIcon) toggleIcon.textContent = isHidden ? '▼' : '▶';

            if (isHidden && subChildList.dataset.loaded !== 'true' && handlers.onExpand) {
                await handlers.onExpand(folder.id, item);
            }
        });

        item.querySelector('.folder-name').addEventListener('contextmenu', (event) => {
            event.preventDefault();
            event.stopPropagation();
            handlers.onOpenMenu(event, folder);
        });

        childList.appendChild(item);
    });
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

    // 4. Wait for each action so failures can be surfaced to the user.
    const runAction = async (action) => {
        try {
            await action();
        } catch (error) {
            alert(`Action failed: ${error.message || String(error)}`);
        } finally {
            closeMenu();
        }
    };

    menu.querySelector('#ctx-rename').onclick = () => runAction(() => handlers.onRename(folder.id));
    menu.querySelector('#ctx-add-folder').onclick = () => runAction(() => handlers.onAddFolder(folder.id));
    menu.querySelector('#ctx-delete').onclick = () => runAction(() => handlers.onDelete(folder.id));

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

