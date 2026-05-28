/**
 * Merender daftar folder/request ke dalam elemen container (child-list)
 * @param {HTMLElement} parentElement - Elemen tempat list akan disisipkan
 * @param {Array} folders - Data folder
 * @param {Array} requests - Data request
 * @param {Object} handlers - Callback untuk aksi
 */
export function renderFolderChildren(parentElement, folders, requests, handlers) {
    // 1. Cari container child-list di scope parentElement
    let childList = parentElement.querySelector(':scope > .child-list');

    // 2. Logika Toggle (Jika sudah ada, cukup tampilkan/sembunyikan)
    if (childList) {
        const isHidden = childList.style.display === 'none';
        childList.style.display = isHidden ? 'block' : 'none';
        
        const header = parentElement.querySelector(':scope > .folder-header');
        const icon = header ? header.querySelector('.toggle-icon') : null;
        if (icon) icon.textContent = isHidden ? '▼' : '▶';
        return;
    }

    // 3. Jika tidak ada data, hentikan
    if (!folders || folders.length === 0) return;

    // 4. Buat container childList baru
    childList = document.createElement('div');
    childList.className = 'child-list';
    childList.style.paddingLeft = '20px';
    childList.style.display = 'block';
    parentElement.appendChild(childList);

    // 5. Render setiap folder ke dalam childList
    folders.forEach(folder => {
        const item = document.createElement('div');
        item.className = 'folder-item';
        item.dataset.id = folder.id; 
        
        item.innerHTML = `
            <div class="folder-header">
                <span class="toggle-icon">▶</span>
                <span class="folder-name" data-id="${folder.id}">📁 ${folder.name}</span>
            </div>
        `;
        childList.appendChild(item);
    });

    // 6. EVENT DELEGATION
    if (!parentElement.dataset.listenerAttached) {
        parentElement.addEventListener('click', (e) => {
            const toggleIcon = e.target.closest('.toggle-icon');
            if (!toggleIcon) return;
            
            const item = toggleIcon.closest('.folder-item');
            if (!item) return;

            const existingSub = item.querySelector(':scope > .child-list');
            
            // Jika sub-folder sudah ada, kita cukup toggle saja (klik kedua dst.)
            if (existingSub) {
                const isHidden = existingSub.style.display === 'none';
                existingSub.style.display = isHidden ? 'block' : 'none';
                toggleIcon.textContent = isHidden ? '▼' : '▶';
            } 
            // Jika belum ada, ini adalah KLIK PERTAMA, kita panggil onExpand
            else {
                // Jangan ubah icon di sini agar tidak 'fighting' dengan render berikutnya
                handlers.onExpand(item.dataset.id, item);
            }
        });

        parentElement.addEventListener('contextmenu', (e) => {
            const nameEl = e.target.closest('.folder-name');
            if (!nameEl) return;
            e.preventDefault();
            e.stopPropagation();
            handlers.onOpenMenu(e, { 
                id: nameEl.dataset.id, 
                name: nameEl.textContent.replace('📁 ', '') 
            });
        });

        parentElement.dataset.listenerAttached = "true";
    }
}

function toggleExpand(item, folder, handlers) {
    const icon = item.querySelector('.toggle-icon');
    const isExpanded = icon.textContent === '▼';
    
    icon.textContent = isExpanded ? '▶' : '▼';
    
    if (!isExpanded) {
        // Panggil handler untuk mengambil data anak dari backend/state
        // Handler ini harus memanggil renderFolderChildren kembali jika ada data baru
        handlers.onExpand(folder.id, item); 
    } else {
        const childList = item.querySelector('.child-list');
        if (childList) childList.remove();
    }
}

/**
 * Menampilkan context menu khusus folder
 */
export function showFolderContextMenu(e, folder, handlers) {
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    Object.assign(menu.style, {
        position: 'fixed',
        left: `${e.clientX}px`,
        top: `${e.clientY}px`,
        background: '#252526',
        border: '1px solid #454545',
        padding: '5px 0',
        zIndex: '1000'
    });

    menu.innerHTML = `
        <div class="menu-item" id="ctx-rename" style="padding:5px 15px;">Rename</div>
        <div class="menu-item" id="ctx-add-folder" style="padding:5px 15px;">Add Sub-Folder</div>
        <div class="menu-item" id="ctx-add-request" style="padding:5px 15px;">Add Request</div>
        <div class="menu-item" id="ctx-delete" style="padding:5px 15px; color:#f44336;">Delete</div>
    `;

    document.body.appendChild(menu);

    menu.querySelector('#ctx-rename').onclick = () => { handlers.onRename(folder.id); menu.remove(); };
    menu.querySelector('#ctx-add-folder').onclick = () => { handlers.onAddFolder(folder.id); menu.remove(); };
    menu.querySelector('#ctx-delete').onclick = () => { handlers.onDelete(folder.id); menu.remove(); };

    document.addEventListener('click', () => menu.remove(), { once: true });
}