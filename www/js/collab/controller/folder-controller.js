import { FolderService } from "../folder-service.js";
import { RequestService } from "../request-service.js";
import { renderFolderChildren, showFolderContextMenu } from "../ui/folder-ui.js";
import { RequestUI } from "../ui/request-ui.js"; // <--- TAMBAHKAN INI

export class FolderController {
    constructor(ui, State, { onUpdateUI, workspaceId, collectionId, requestCtrl }) {
        this.ui = ui;
        this.State = State;
        this.onUpdateUI = onUpdateUI;
        this.workspaceId = workspaceId;
        this.collectionId = collectionId;
        this.requestCtrl = requestCtrl;
        
         // BroadcastChannel untuk sinkronisasi antar tab
        this.bc = new BroadcastChannel('folder_channel');
        this.setupBroadcastListener();

        window.addEventListener("socket:message", (e) => {
            const payload = e.detail;
            if (payload.type && payload.type.startsWith('FOLDER_')) {
                this.handleSocketMessage(payload);
            }
        });

        // Di constructor atau init FolderController
        window.addEventListener('request:created', (e) => {
            const newReq = e.detail;
            // Cek apakah request ini miliknya folder yang sedang aktif/terbuka
            // Jika ya, cukup panggil renderFolder untuk folder spesifik itu saja
            const folderEl = document.querySelector(`.folder-item[data-id="${newReq.folder_id}"]`);
            if (folderEl) {
                this.renderFolder(newReq.folder_id, folderEl);
            } else if (!newReq.folder_id) {
                // Jika folder_id null, render di level root (koleksi)
                this.renderRoot(); 
            }
        });
    }

    async init(collectionId) {
        this.collectionId = collectionId;
        this.workspaceId = this.State.workspaceId || document.body.dataset.currentWsId || this.workspaceId;
        const folders = await FolderService.getByCollection(collectionId);
        this.State.folders = folders;
        
        // Render root folders dan requests untuk collection ini secara langsung saat init
        const colEl = document.querySelector(`[data-collection-id="${collectionId}"]`) || document.querySelector(`[data-id="${collectionId}"]`);
        if (colEl) {
            this.renderFolder(null, colEl);
        } else {
            this.render(); 
        }
    }

    setupBroadcastListener() {
        this.bc.onmessage = (event) => {
            this.handleSocketMessage(event.data);
        };
    }


    async getFoldersByCollection(collectionId) {
        // Kita filter dulu dari State lokal (jika sudah ada)
        const local = this.State.folders.filter(f => String(f.collection_id) === String(collectionId));
        
        // Jika State masih kosong (misal belum di-init), fetch dari service
        if (local.length === 0) {
            return await FolderService.getByCollection(collectionId);
        }
        return local;
    }


    handleSocketMessage(payload) {
        const { type, data, folder_id } = payload;
        
        // 1. UPDATE STATE dengan proteksi
        switch (type) {
            case 'FOLDER_CREATED':
                if (!this.State.folders.find(f => f.id === data.id)) {
                    this.State.folders.push(data);
                }
                break;
            case 'FOLDER_DELETED':
                this.State.folders = this.State.folders.filter(f => f.id !== folder_id);
                const deletedEl = document.querySelector(`[data-id="${folder_id}"]`);
                if (deletedEl) deletedEl.remove();
                break;
            case 'FOLDER_UPDATED':
                const idx = this.State.folders.findIndex(f => f.id === data.id);
                if (idx !== -1) {
                    this.State.folders[idx] = { ...this.State.folders[idx], ...data };
                }
                break;
        }
    
        // 2. Render sidebar utama
        this.render();
    

        const expandedFolders = document.querySelectorAll('.folder-item');
        expandedFolders.forEach(el => {
            const childList = el.querySelector('.child-list');
            if (childList) {
            const folderId = parseInt(el.dataset.id);
            // Kita panggil refreshFolderView agar ia merender ulang 
            // isi di dalam elemen tersebut dengan data terbaru dari State
            this.refreshFolderView(folderId, el);
            }
    });

        // 3. TARGETED RE-RENDER
        // Menggunakan requestAnimationFrame untuk mencegah race condition DOM
        requestAnimationFrame(() => {
            if (type === 'FOLDER_CREATED' || type === 'FOLDER_UPDATED') {
                const targetParentId = data.parent_id;
                
                // Jika parent_id null, targetkan container koleksi
                if (targetParentId === null) {
                    const colEl = document.querySelector(`[data-collection-id="${this.collectionId}"]`);
                    if (colEl) this.renderFolder(null, colEl);
                } else {
                    // Jika ada parent_id, targetkan folder parent tersebut
                    const parentEl = document.querySelector(`[data-id="${targetParentId}"]`);
                    if (parentEl) this.renderFolder(targetParentId, parentEl);
                }
            }
        });
    }

    

    renderFolder(folderId, parentElement) {
        // 1. Mencegah proses render ganda
        if (parentElement.getAttribute('data-rendering') === 'true') return;
        parentElement.setAttribute('data-rendering', 'true');
        
        const existingChildList = parentElement.querySelector(':scope > .child-list');
        if (existingChildList) {
            existingChildList.innerHTML = ''; // Hapus semua isi lama
        }
        console.log("DEBUG: Memulai render folderId:", folderId);
        
        // 2. AMBIL DATA DARI SUMBER TERPERCAYA
        // Jika FolderController punya akses ke requestCtrl, pakai itu.
        // Jika tidak, baru pakai this.State.requests
        const allRequests = (this.requestCtrl && this.requestCtrl.State) 
                            ? this.requestCtrl.State.requests 
                            : (this.State.requests || []);
        
        console.log("DEBUG: Total requests yang tersedia di controller:", allRequests.length);
        
        // 3. Filter folder
        const subFolders = this.State.folders.filter(f => {
            const isTargetParent = (folderId === null) 
                ? (f.parent_id === null || f.parent_id === undefined)
                : (String(f.parent_id) === String(folderId));
            return isTargetParent && String(f.collection_id) === String(this.collectionId);
        });
        
        // 4. Filter request dengan logika yang lebih fleksibel
        const requests = allRequests.filter(r => {
            if (folderId === null && parentElement.classList.contains('collection-item')) {
                return false;
            }

            const reqFolderId = r.folder_id != null ? String(r.folder_id) : null;
            const targetFolderId = folderId != null ? String(folderId) : null;
            
            const isTargetFolder = (targetFolderId === null) 
                ? (reqFolderId === null || reqFolderId === 'null') 
                : (reqFolderId === targetFolderId);
                
            const isTargetCollection = String(r.collection_id) === String(this.collectionId);
            
            return isTargetFolder && isTargetCollection;
        });
        
        console.log(`[DEBUG] Render folderId ${folderId}. Ditemukan: ${subFolders.length} Folders, ${requests.length} Requests.`);
        
        try {
          renderFolderChildren(parentElement, subFolders, requests, {
            onOpenMenu: (e, folder) => showFolderContextMenu(e, folder, {
                onRename: async (id) => { 
                    const name = await window.customPrompt("New name:", folder.name); 
                    if (name) await this.renameFolder(id, name);
                },
                onDelete: (id) => this.deleteFolder(id),
                onAddFolder: async (parentId) => { 
                    const name = await window.customPrompt("Folder name:"); 
                    if (name) await this.createFolder(this.State.workspaceId || document.body.dataset.currentWsId || this.workspaceId, this.collectionId, parentId, name);
                },
                    onAddRequest: async (fId, cId) => {
                        if (this.requestCtrl) {
                            // 1. Buat request
                            const newRequest = await this.requestCtrl.createRequest({
                                workspace_id: this.State.workspaceId,
                                collection_id: this.collectionId,
                                folder_id: fId,
                                name: "New Request" // Anda mungkin ingin prompt nama di sini
                            });
                    
                            // 2. Trik UI: Paksa update State agar tidak perlu refresh
                            if (newRequest) {
                                // Tambahkan request baru ke array state agar langsung terdeteksi
                                if (!this.requestCtrl.State.requests) this.requestCtrl.State.requests = [];
                                //this.requestCtrl.State.requests.push(newRequest);
                                
                                // 3. Re-render folder yang sedang dibuka saja
                                // Kita cari elemen parent-nya dan render ulang
                                const parentElement = document.querySelector(`.folder-item[data-id="${fId}"]`) 
                                                      || document.querySelector(`[data-collection-id="${this.collectionId}"]`);
                                
                                if (parentElement) {
                                    // Kita panggil renderFolder lagi untuk elemen ini
                                    this.renderFolder(fId, parentElement);
                                }
                            }
                        }
                    }
                }),
                onExpand: (id, el) => {
                    this.renderFolder(id, el);
                },
                requestHandlers: this.requestCtrl ? this.requestCtrl.handlers : {},
                onOpenTab: (r) => {
                    if (this.requestCtrl && this.requestCtrl.tabCtrl) {
                        this.requestCtrl.tabCtrl.openTab(r);
                    }
                }
            });
        } catch (err) {
            console.error("DEBUG: Terjadi error saat render folder:", err);
        } finally {
            parentElement.removeAttribute('data-rendering');
        }
    }

    refreshFolderView(folderId, itemElement) {
        // 1. Ambil data dari state
        const subFolders = this.State.folders.filter(f => String(f.parent_id) === String(folderId));
        const requests = this.State.requests 
            ? this.State.requests.filter(r => String(r.folder_id) === String(folderId)) 
            : [];
        
        // 2. Definisi Handler
      const folderHandlers = {
        onRename: async (id) => {
            const name = await window.customPrompt("New name:", this.State.folders.find(f => String(f.id) === String(id))?.name);
            if(name) await this.renameFolder(id, name);
        },
        onDelete: (id) => this.deleteFolder(id),
        onExpand: (id, el) => this.refreshFolderView(id, el),
        onAddFolder: async (parentId) => {
            const name = await window.customPrompt("Folder name:");
            if(name) await this.createFolder(this.State.workspaceId || document.body.dataset.currentWsId || this.workspaceId, this.collectionId, parentId, name);
        },
        onAddRequest: (fId, cId) => {
            const targetColId = cId || this.collectionId;
            const wsId = this.State.workspaceId || this.workspaceId;
            
            if (this.requestCtrl) {
                this.requestCtrl.createRequest({
                    workspace_id: wsId,
                    collection_id: targetColId,
                    folder_id: fId
                });
            }
        }
    };
        
        // 3. Render Struktur Folder (Child List)
        renderFolderChildren(itemElement, subFolders, requests, {
            onOpenMenu: (e, folder) => showFolderContextMenu(e, folder, folderHandlers),
            onExpand: (id, el) => this.refreshFolderView(id, el)
        });
        
        // 4. Render Request khusus ke container folder ini
        const reqContainer = itemElement.querySelector(`#requests-container-folder-${folderId}`);
        
        if (reqContainer) {
            reqContainer.innerHTML = ''; // Membersihkan kontainer folder saat ini saja
            requests.forEach(req => {
                const handlers = this.requestCtrl ? this.requestCtrl.handlers : {};
                const openTab = this.requestCtrl && this.requestCtrl.tabCtrl 
                    ? (r) => this.requestCtrl.tabCtrl.openTab(r) 
                    : () => {};
                
                RequestUI.renderRequestItem(req, reqContainer, handlers, openTab);
            });
        }
    }
        

    async render() {
        if (this.onUpdateUI) this.onUpdateUI(this.State.folders);
        window.dispatchEvent(new Event('panel-rendered'));
    }

    async createFolder(workspaceId, collectionId, parentId, name) {
        const targetWorkspaceId = workspaceId || this.State.workspaceId || document.body.dataset.currentWsId || this.workspaceId;
        // 1. Resolve collectionId dengan aman
        let targetCollectionId = collectionId;
        if (!targetCollectionId && parentId) {
            const parentFolder = this.State.folders.find(f => String(f.id) === String(parentId));
            if (parentFolder) {
                targetCollectionId = parentFolder.collection_id;
            }
        }

        if (!targetWorkspaceId || !targetCollectionId) {
            throw new Error("An active workspace and collection are required to add a folder.");
        }
    
        console.log(`[DEBUG] Creating folder: Name=${name}, Parent=${parentId}, Collection=${targetCollectionId}`);
    
        try {
            const newFolder = await FolderService.create(targetWorkspaceId, targetCollectionId, parentId, name);

            if (newFolder && !this.State.folders.some(folder => String(folder.id) === String(newFolder.id))) {
                this.State.folders.push(newFolder);
            }
            
            // 2. Broadcast ke tab lain
            this.bc.postMessage({ type: 'FOLDER_CREATED', data: newFolder });
            
            // 3. Update Local State
            
            // 4. Targeted UI Update
            if (parentId) {
                // Cari elemen parent berdasarkan dataset id
                const parentElement = document.querySelector(`.folder-item[data-id="${parentId}"]`);
                
                if (parentElement) {
                    // Hapus child-list lama agar sinkron dengan state baru
                    const oldList = parentElement.querySelector(':scope > .child-list');
                    if (oldList) oldList.remove();
                    
                    // Pastikan lock dilepas agar bisa dirender ulang
                    parentElement.removeAttribute('data-rendering');
                    
                    // Panggil renderFolder untuk parent spesifik ini
                    this.renderFolder(parentId, parentElement);
                }
            } else {
                // Jika root level, render ulang collection yang sedang dibuka.
                this.collectionId = targetCollectionId;
                const collectionElement = document.querySelector(
                    `.collection-item[data-id="${targetCollectionId}"], [data-collection-id="${targetCollectionId}"]`
                );
                if (collectionElement) {
                    this.renderFolder(null, collectionElement);
                } else {
                    this.render();
                }
            }
        } catch (error) {
            console.error("Gagal membuat folder:", error);
            throw error;
        }
    }

    async renameFolder(id, newName) {
        await FolderService.update(id, { name: newName });
        this.bc.postMessage({ type: 'FOLDER_UPDATED', data: { id, name: newName } });
        const idx = this.State.folders.findIndex(f => String(f.id) === String(id));
        if (idx !== -1) {
            this.State.folders[idx].name = newName;
        }

        const folderElement = document.querySelector(`.folder-item[data-id="${id}"]`);
        const nameElement = folderElement?.querySelector('.folder-name');
        if (nameElement) nameElement.textContent = `📁 ${newName}`;
    }

    async deleteFolder(id) {
        const isConfirmed = await window.customConfirm("Delete this folder and all requests inside it?");
        if (!isConfirmed) return;

        const folder = this.State.folders.find(item => String(item.id) === String(id));
        const collectionId = folder?.collection_id || this.collectionId;
        const [folders, requests] = await Promise.all([
            FolderService.getByCollection(collectionId),
            RequestService.getByCollection(collectionId)
        ]);
        const folderIds = new Set([String(id)]);
        let foundDescendant = true;

        while (foundDescendant) {
            foundDescendant = false;
            for (const item of folders) {
                if (item.parent_id != null && folderIds.has(String(item.parent_id)) && !folderIds.has(String(item.id))) {
                    folderIds.add(String(item.id));
                    foundDescendant = true;
                }
            }
        }

        const requestsToDelete = requests.filter(request => folderIds.has(String(request.folder_id)));
        for (const request of requestsToDelete) {
            await RequestService.delete(request.id);
            this.State.requests = this.State.requests.filter(item => String(item.id) !== String(request.id));
            this.requestCtrl?.bc?.postMessage({ type: 'REQUEST_DELETED', request_id: request.id });
            RequestUI.removeRequestElement(request.id);
            const openTab = this.requestCtrl?.tabCtrl?.tabs.find(tab => String(tab.id) === String(request.id));
            if (openTab) this.requestCtrl.tabCtrl.forceCloseTab(openTab.id);
        }

        await FolderService.delete(id);
        this.bc.postMessage({ type: 'FOLDER_DELETED', folder_id: id });
        this.State.folders = this.State.folders.filter(item => !folderIds.has(String(item.id)));
        document.querySelector(`.folder-item[data-id="${id}"]`)?.remove();
    }
}