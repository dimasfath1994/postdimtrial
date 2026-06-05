/**
 * request-picker.js
 * Modul untuk menangani UI pemilihan lokasi (Koleksi/Folder)
 * Menggunakan Dependency Injection agar tidak bergantung pada variabel global.
 */

// Referensi lokal ke dependency yang di-inject
let _requestCtrl = null;
let _state = null;
let _folderCtrl = null;

// Elemen Modal
const modal = document.getElementById('addRequestModal');
const cancelRequestBtn = document.getElementById('cancelRequest');

/**
 * Inisialisasi modul dengan dependency yang dibutuhkan
 */
export function initRequestPicker(requestCtrl, state, folderCtrl) {
    _requestCtrl = requestCtrl;
    _state = state;
    _folderCtrl = folderCtrl;

    const addRequestBtn = document.getElementById('addRequest');
    const actionDropdown = document.getElementById('actionDropdown');

    // Listener tombol buka modal
    if (addRequestBtn) {
        addRequestBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (actionDropdown) actionDropdown.style.display = 'none';
            showRequestPicker();
        });
    }

    // Listener tutup modal
    if (cancelRequestBtn) {
        cancelRequestBtn.onclick = () => modal.classList.add('hidden');
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    });
}

/**
 * Logika internal untuk merender modal
 */
async function showRequestPicker() {
    modal.classList.remove('hidden');
    const container = document.getElementById('locationPicker');
    container.innerHTML = '<div class="picker-item">Loading...</div>';

    try {
        const collections = _state.collections || [];
        let html = '';

        for (const col of collections) {
            html += `
                <div class="picker-item col-head" data-col-id="${col.id}">
                    📂 <strong>${col.name}</strong>
                </div>`;
            
            const folders = await _folderCtrl.getFoldersByCollection(col.id); 
            
            if (folders && folders.length > 0) {
                folders.forEach(folder => {
                    html += `
                        <div class="picker-item folder-item" 
                             data-col-id="${col.id}" 
                             data-folder-id="${folder.id}" 
                             style="padding-left: 30px;">
                             📁 ${folder.name}
                        </div>`;
                });
            }
        }
        
        container.innerHTML = html;

        container.querySelectorAll('.picker-item').forEach(item => {
            item.onclick = async () => {
                const colId = item.dataset.colId;
                const folderId = item.dataset.folderId || null; 
                
                await _requestCtrl.createRequest({
                    workspace_id: _state.workspaceId,
                    collection_id: colId,
                    folder_id: folderId
                });
                
                modal.classList.add('hidden');
            };
        });
    } catch (err) {
        container.innerHTML = '<div class="picker-item">Error loading locations.</div>';
        console.error("Gagal memuat picker:", err);
    }
}