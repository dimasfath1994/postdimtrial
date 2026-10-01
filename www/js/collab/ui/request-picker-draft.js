/**
 * request-picker-draft.js
 */
import { escapeHtml } from './html-escape.js';

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
        let html = '<div class="picker-header">Choose a location:</div>';

        // ... (sisanya sama, gunakan fungsi renderFolderRecursive yang tadi)
        function renderFolderRecursive(allFolders, parentId, colId, padding) {
            let folderHtml = '';
            const children = allFolders.filter(folder => parentId == null
                ? folder.parent_id == null
                : String(folder.parent_id) === String(parentId));
            children.forEach(folder => {
                folderHtml += `<div class="picker-item folder-item" data-col-id="${escapeHtml(colId)}" data-folder-id="${escapeHtml(folder.id)}" style="padding-left: ${padding}px; cursor: pointer;">📁 ${escapeHtml(folder.name)}</div>`;
                folderHtml += renderFolderRecursive(allFolders, folder.id, colId, padding + 20);
            });
            return folderHtml;
        }

        for (const col of collections) {
            html += `<div class="picker-item col-head" data-col-id="${escapeHtml(col.id)}" style="font-weight: bold; cursor: pointer;">📂 ${escapeHtml(col.name)}</div>`;
            const allFolders = await _folderCtrl.getFoldersByCollection(col.id); 
            if (allFolders) html += renderFolderRecursive(allFolders, null, col.id, 30);
        }
        
        container.innerHTML = html;

        container.querySelectorAll('.picker-item').forEach(item => {
            item.onclick = async () => {
                item.setAttribute('aria-busy', 'true');
                try {
                    await _draftServerCtrl.commitDraftToServer(_currentDraftId, {
                        collection_id: item.dataset.colId,
                        folder_id: item.dataset.folderId || null
                    });
                    modal.style.display = 'none';

                    // Pastikan tab tertutup setelah berhasil save
                    if (window.tabCtrl) window.tabCtrl.forceCloseTab(_currentDraftId);
                } catch (error) {
                    console.error("Gagal menyimpan draft:", error);
                    alert(`Failed to save draft: ${error.message || String(error)}`);
                } finally {
                    item.removeAttribute('aria-busy');
                }
            };
        });
    } catch (err) {
        container.innerHTML = 'Error loading collections.';
    }
}