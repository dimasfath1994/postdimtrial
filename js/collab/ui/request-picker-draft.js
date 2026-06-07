/**
 * request-picker-draft.js
 */

let _draftServerCtrl = null;
let _state = null;
let _folderCtrl = null;
let _currentDraftId = null;
let _workspaceId = null;

/**
 * Inisialisasi modul dan Inject modal ke DOM jika belum ada
 */
export function initDraftPicker(draftServerCtrl, state, folderCtrl, workspaceId) {
    _draftServerCtrl = draftServerCtrl;
    _state = state;
    _folderCtrl = folderCtrl;
    _workspaceId = workspaceId;

    // Inject modal ke body jika belum ada
    if (!document.getElementById('saveDraftModal')) {
        const modalHtml = `
        <div id="saveDraftModal" class="hidden modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 9999; justify-content: center; align-items: center; display: none;">
            <div class="modal-content" style="background: #1e1e1e; padding: 20px; border-radius: 8px; width: 400px; max-height: 80vh; overflow-y: auto; color: #e0e0e0; border: 1px solid #333; box-shadow: 0 4px 15px rgba(0,0,0,0.5);">
                <h3 style="margin-top: 0; border-bottom: 1px solid #333; padding-bottom: 10px;">Save Draft</h3>
                <div id="draftLocationPicker" style="margin: 15px 0;"></div>
                <button id="cancelSaveDraft" style="background: #444; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;">Cancel</button>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    // Set listener untuk tombol
    document.getElementById('cancelSaveDraft').onclick = () => {
        document.getElementById('saveDraftModal').style.display = 'none';
    };

    document.getElementById('saveDraftModal').addEventListener('click', (e) => {
        if (e.target.id === 'saveDraftModal') {
            document.getElementById('saveDraftModal').style.display = 'none';
        }
    });
}

/**
 * Membuka modal picker
 */
export async function showDraftPicker(draftId) {
    const modal = document.getElementById('saveDraftModal');
    if (!modal) return;

    _currentDraftId = draftId;
    modal.style.display = 'flex'; // Tampilkan modal
    
    const container = document.getElementById('draftLocationPicker');
    container.innerHTML = '<div class="picker-item">Loading collections...</div>';

    try {
        const collections = _state.collections || [];
        let html = '<div class="picker-header">Pilih lokasi:</div>';

        // ... (sisanya sama, gunakan fungsi renderFolderRecursive yang tadi)
        function renderFolderRecursive(allFolders, parentId, colId, padding) {
            let folderHtml = '';
            allFolders.filter(f => f.parent_id === parentId).forEach(folder => {
                folderHtml += `<div class="picker-item folder-item" data-col-id="${colId}" data-folder-id="${folder.id}" style="padding-left: ${padding}px; cursor: pointer;">📁 ${folder.name}</div>`;
                folderHtml += renderFolderRecursive(allFolders, folder.id, colId, padding + 20);
            });
            return folderHtml;
        }

        for (const col of collections) {
            html += `<div class="picker-item col-head" data-col-id="${col.id}" style="font-weight: bold; cursor: pointer;">📂 ${col.name}</div>`;
            const allFolders = await _folderCtrl.getFoldersByCollection(col.id); 
            if (allFolders) html += renderFolderRecursive(allFolders, null, col.id, 30);
        }
        
        container.innerHTML = html;

        container.querySelectorAll('.picker-item').forEach(item => {
            item.onclick = async () => {
                await _draftServerCtrl.commitDraftToServer(_currentDraftId, {
                    collection_id: item.dataset.colId,
                    folder_id: item.dataset.folderId || null
                });
                modal.style.display = 'none';
                
                // Pastikan tab tertutup setelah berhasil save
                if (window.tabCtrl) window.tabCtrl.closeTab(_currentDraftId);
            };
        });
    } catch (err) {
        container.innerHTML = 'Error loading collections.';
    }
}