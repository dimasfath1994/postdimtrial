//collab-app.js

import { WorkspaceController } from "./controller/workspace-controller.js";
import { initWorkspaceUI } from "./ui/workspace-ui.js";
import { guardCollaborationAccess } from "./collab-auth-guard.js";
import { setupGlobalSocket } from '../ws/request-socket.js';
import { SocketDispatcher } from "../ws/socket-dispatcher.js";

import { CollectionController } from "./controller/collection-controller.js";
import { renderCollectionSidebar, setupCollectionActions } from "./ui/collection-ui.js";

import { FolderController } from "./controller/folder-controller.js";

import { RequestController } from "./controller/request-controller.js";
import { TabController } from "./controller/tab-controller.js";

import { TabManagerUI } from './ui/tabmanager-ui.js';
import { RequestParamController } from './controller/request-param-controller.js';

import { RequestHeaderController } from './controller/request-header-controller.js';
import { MonacoController } from "./controller/monaco-controller.js";

import { RequestBodyParamController } from './controller/request-body-param-controller.js';
import { initBodyTabs } from './ui/body-tabs.js';

import { EnvController } from "./controller/env-controller.js";
import { GlobalController } from "./controller/global-controller.js";

import { EnvUI } from './ui/env-ui.js';

import { PMSandbox } from './services/pm-sandbox.js';

import { RequestFormatter } from './services/request-formatter.js';
import { VariableResolver } from './services/variable-resolver.js';
import { RequestDispatcher } from './services/request-dispatcher.js';
import { ResponseHandler } from './services/response-handler.js';


function hydrateState(data) { console.log("Hydrate data", data); }

const ui = {
    workspaceSwitcher: document.getElementById("workspaceSwitcher"),
    workspaceTitle: document.getElementById("workspaceTitle"),
    activeWorkspaceName: document.getElementById("activeWorkspaceName"),
    collectionList: document.getElementById("collectionList")
};

// --- Element Selectors ---
const openEnvModal = document.getElementById('openEnvModal');
const closeEnvPanel = document.getElementById('closeEnvPanel');
const envPanel = document.getElementById('envPanel');

const State = { 
    workspaceId: null,
    workspace: null,
    workspaceList: [],
    collections: [],
    activeCollectionId: null,
    folders: [] ,
    requests: [],
    params: [],
    headers: [],
    bodyParams: [],
    environments: [],
    globals: []
 };
const dispatcher = new SocketDispatcher();



// =============== INITIALIZE REQUEST-PARAM-CONTROLLER ================
const paramCtrl = new RequestParamController(State);

// =============== INITIALIZE BODY-PARAM-CONTROLLER ================
const bodyParamCtrl = new RequestBodyParamController(State);


// =============== INITIALIZE REQUEST-HEADER-CONTROLLER ================
const headerCtrl = new RequestHeaderController(State);

//=============== INITIALIZE TAB REQUEST ================
const tabCtrl = new TabController(ui, null, State, paramCtrl, headerCtrl);

initBodyTabs(bodyParamCtrl, tabCtrl)

 //=============== INITIALIZE REQUEST ================
const requestCtrl = new RequestController(ui, State, {
    workspaceId: State.workspaceId,
    tabCtrl: tabCtrl,
    onUpdateUI: (requests) => {
        console.log("Requests state updated:", requests);
        State.requests = requests;
    }
});

tabCtrl.handlers = {
    ...requestCtrl.handlers,
    onUpdateFull: (id) => requestCtrl.updateRequestFull(id)
};
//tabCtrl.handlers = requestCtrl.handlers;
tabCtrl.setRequestGetter((id) => requestCtrl.getRequestById(id));


 //=============== INITIALIZE Monaco ================
 const monacoCtrl = new MonacoController(() => {
    if (tabCtrl.activeTabId) {
        requestCtrl.updateRequestFull(tabCtrl.activeTabId);
    }
}, tabCtrl); // <--- Kirim tabCtrl di sini

monacoCtrl.init();
tabCtrl.monacoCtrl = monacoCtrl;


 //=============== INITIALIZE WORKSPACE ================
const workspaceCtrl = new WorkspaceController(ui, State, {
    loadCollectionsCallback: loadCollections,
    hydrateStateCallback: hydrateState
});

workspaceCtrl.onSwitchWorkspace = (id) => {
    connectSocket(id);
    requestCtrl.init(id); // Reset/Fetch ulang request saat pindah workspace
};


//=============== INITIALIZE FOLDER ================
// Pastikan folderCtrl diinisialisasi dengan struktur yang tepat
const folderCtrl = new FolderController(ui, State, {
    workspaceId: State.workspaceId, 
    collectionId: null, 
    requestCtrl: requestCtrl,
    onUpdateUI: (folders) => {
        console.log("Folders state updated:", folders);
    }
});

folderCtrl.handlers = {
    onExpand: (id, el) => folderCtrl.renderFolder(id, el),
    onOpenMenu: (e, folder) => folderCtrl.showContextMenu(e, folder),
    requestHandlers: requestCtrl.handlers, // Wajib ada untuk render request di dalam folder
    onOpenTab: (r) => tabCtrl.openTab(r)
};

window.folderCtrl = folderCtrl;

//=============== INITIALIZE COLLECTION ================
const collectionCtrl = new CollectionController(ui, State, {
    folderCtrl: folderCtrl,
    requestCtrl: requestCtrl,
    onUpdateUI: (cols) => {
        const collectionListContainer = document.getElementById('collectionList');
        
        renderCollectionSidebar(
            collectionListContainer, 
            cols, 
            {
                onOpenMenu: (e, col) => collectionCtrl.showContextMenu(e, col),
                onExpand: async (collectionId, itemElement) => {
                    // 1. Pastikan request benar-benar sudah ada datanya sebelum lanjut
                    if (!requestCtrl.State.requests || requestCtrl.State.requests.length === 0) {
                        console.log("DEBUG: Data request kosong, melakukan await requestCtrl.init...");
                        await requestCtrl.init(State.workspaceId); // Tambahkan 'await' di sini
                    }
                    
                    // 2. Sekarang baru init folder dan render
                    await folderCtrl.init(collectionId);
                    itemElement.dataset.collectionId = collectionId;
                    
                    folderCtrl.renderFolder(null, itemElement);
                    
                }
            }
        );
    }
});

setupCollectionActions(collectionCtrl);



// =============== INITIALIZE ENV & GLOBAL CONTROLLER ================
const envCtrl = new EnvController(State);
const globalCtrl = new GlobalController(State);


// =============== INITIALIZE SOCKET DISPATCHER ================
dispatcher.register('WORKSPACE_', workspaceCtrl);
dispatcher.register('COLLECTION_', collectionCtrl);
dispatcher.register('FOLDER_', folderCtrl);
dispatcher.register('REQUEST_', requestCtrl);
dispatcher.register('PARAM_', paramCtrl);
dispatcher.register('HEADER_', headerCtrl);


// Saat inisialisasi socket, cukup panggil dispatcher.dispatch
function initSocket(workspaceId) {
    setupGlobalSocket(workspaceId, (payload) => {
        dispatcher.dispatch(payload);
    });
}


let currentSocket = null;
let currentConnectedId = null; 
let isConnecting = false;

function connectSocket(id) {
    // 1. Guard: Tidak perlu melakukan apa-apa jika sudah terhubung
    State.workspaceId = id;
    if (currentConnectedId === id && currentSocket?.readyState === WebSocket.OPEN) {
        return;
    }

    // 2. Guard: Jika sedang proses connecting, batalkan request baru
    if (isConnecting) return;
    
    // 3. Bersihkan koneksi lama secara sinkron
    if (currentSocket) {
        currentSocket.onmessage = null;
        currentSocket.onclose = null;
        currentSocket.onerror = null;
        try {
            currentSocket.close();
        } catch (e) {
            console.warn("[SOCKET] Cleanup:", e);
        }
        currentSocket = null;
    }

    // 4. Inisialisasi Koneksi (Sinkron)
    isConnecting = true;
    console.log(`[DEBUG] Memulai socket BARU untuk: ${id}`);
    
    try {
        currentSocket = setupGlobalSocket(id, (payload) => {
            // Callback ini tetap berjalan saat message diterima
            // if (currentConnectedId === id) {
            //     workspaceCtrl.handleSocketMessage(payload);
            // }
            if (currentConnectedId === id) {
                dispatcher.dispatch(payload); 
            }
        });

        // Setup handler onclose sinkron
        currentSocket.onclose = () => {
            isConnecting = false; // Reset status saat close
            // Coba reconnect setelah jeda
            setTimeout(() => connectSocket(id), 3000);
        };
        
        currentSocket.onopen = () => {
            isConnecting = false; // Reset status saat sukses
        };

        currentConnectedId = id;
    } catch (err) {
        console.error("[SOCKET] Gagal:", err);
        isConnecting = false;
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    //initBodyTabs(bodyParamCtrl, tabCtrl);
    initWorkspaceUI(workspaceCtrl);
    const allowed = await guardCollaborationAccess();
    if (allowed)
    {
         await workspaceCtrl.loadFlow();

         const wsId = State.workspaceId; // Pastikan ID workspace tersedia
        await envCtrl.init(null, wsId); // Pass null karena kita tidak butuh render ke UI dulu
        await globalCtrl.init(null);
    }
});

window.addEventListener('request-tab-switched', async (e) => {
    const requestId = e.detail.requestId;
    console.log(`[SYNC] Menyiapkan data untuk request: ${requestId}`);

    // Jalankan semua sync secara paralel agar tidak terasa lambat
    await Promise.all([
        bodyParamCtrl ? bodyParamCtrl.syncWithRequest(requestId) : Promise.resolve(),
        headerCtrl ? headerCtrl.init(requestId, document.getElementById('headersBox')) : Promise.resolve(),
        paramCtrl ? paramCtrl.init(requestId, document.getElementById('paramsBox')) : Promise.resolve()
    ]);
    
    console.log(`[SYNC] Semua data untuk ${requestId} berhasil dimuat ke State.`);
});


// Listener dari Workspace Controller
window.addEventListener("workspace:changed", (event) => {
    //console.log("Workspace changed event received for:", event.detail.id); // Tambahkan log ini
    connectSocket(event.detail.id);
    workspaceCtrl.broadcastSwitch(event.detail.id);

});

async function loadCollections(id) { 
    console.log("Load collections for", id);
    // Panggil method init yang kita buat di CollectionController
    await collectionCtrl.init(id); 
}



TabManagerUI.init(tabCtrl);

// --- Buka/Tutup Modal ---
openEnvModal.addEventListener('click', () => {
    const wsId = State.activeWorkspaceId || State.workspaceId;
    
    // Gunakan class .show untuk menampilkan
    envPanel.classList.add('show');
    
    envCtrl.init(document.getElementById('envList-workspace'), wsId);
    globalCtrl.init(document.getElementById('envList-global'));
});

closeEnvPanel.addEventListener('click', () => {
    // Gunakan class .show untuk menyembunyikan
    envPanel.classList.remove('show');
});
// --- Inisialisasi Handler Add (Hanya 1 baris) ---
EnvUI.setupAddHandler({ envCtrl, globalCtrl }, State);





document.getElementById('send').addEventListener('click', async () => {

    // 1. Kumpulkan data
    const rawData = RequestFormatter.collectFromUI(State);
    const scripts = monacoCtrl.getValues(); 
    
    // Gabungkan script
    const finalData = {
        ...rawData,
        pre_script: scripts.pre_script,
        post_script: scripts.post_script
    };

    // 2. Resolve variabel
    const resolvedData = VariableResolver.resolveRequest(finalData, State);
    
    // 3. Kirim Request
    const response = await RequestDispatcher.send(resolvedData);
    ResponseHandler.render(response);

    // 4. EKSKUSI SCRIPT (Hanya jika ada isi)
    // Trim() memastikan jika user cuma isi spasi/enter, tetap dianggap kosong
    if (resolvedData.post_script && resolvedData.post_script.trim().length > 0) {
        console.log("[PMSandbox] Ditemukan script, menjalankan...");
        
        await PMSandbox.execute(
            resolvedData.post_script, 
            response, 
            State, 
            envCtrl
        );
    } else {
        console.log("[PMSandbox] Tidak ada post-script, dilewati.");
    }
});

// Event listener untuk ganti tab response
document.querySelectorAll('.response-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        const type = e.target.getAttribute('data-tab');
        const res = window.latestResponse;
        if (!res) return;

        if (type === 'body') ResponseHandler.renderBody(res.body);
        if (type === 'headers') ResponseHandler.renderHeaders(res.headers);
        // Tambahkan logic Cookies nanti
    });
});

























// 1. Definisikan elemen modal dan trigger
const modal = document.getElementById('addRequestModal');
const addRequestBtn = document.getElementById('addRequest'); // Tombol di dropdown sidebar
const actionDropdown = document.getElementById('actionDropdown');
const cancelRequestBtn = document.getElementById('cancelRequest');

// 2. Fungsi Utama untuk menampilkan Modal
async function showRequestPicker() {
    modal.classList.remove('hidden');
    const container = document.getElementById('locationPicker');
    container.innerHTML = '<div class="picker-item">Loading...</div>';

    try {
        const collections = State.collections;
        let html = '';

        for (const col of collections) {
            // 1. Tambahkan Header Koleksi
            html += `
                <div class="picker-item col-head" data-col-id="${col.id}">
                    📂 <strong>${col.name}</strong>
                </div>`;
            
            // 2. Ambil folder untuk koleksi ini
            // Pastikan Anda memanggil API atau mengambil dari State yang sudah ter-filter
            const folders = await folderCtrl.getFoldersByCollection(col.id); 
            
            // 3. Hanya loop dan render folder jika folder.length > 0
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

        // 4. Pasang Event Listener
        container.querySelectorAll('.picker-item').forEach(item => {
            item.onclick = async () => {
                const colId = item.dataset.colId;
                const folderId = item.dataset.folderId || null; 
                console.log("DEBUG: Mengirim ke RequestController:", { colId, folderId });
                
                // Eksekusi create request
                await requestCtrl.createRequest({
                    workspace_id: State.workspaceId,
                    collection_id: colId,
                    folder_id: folderId // Jika folderId null, request masuk ke root collection
                });
                
                modal.classList.add('hidden');
            };
        });
    } catch (err) {
        container.innerHTML = '<div class="picker-item">Error loading locations.</div>';
        console.error("Gagal memuat picker:", err);
    }
}

// 3. Event Listener untuk tombol "Add Request" di dropdown
if (addRequestBtn) {
    addRequestBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        actionDropdown.style.display = 'none'; // Tutup dropdown
        showRequestPicker(); // Panggil fungsi modal
    });
}

// 4. Event Listener untuk tombol Close/Cancel
if (cancelRequestBtn) {
    cancelRequestBtn.onclick = () => modal.classList.add('hidden');
}

// Opsional: Tutup modal jika klik di luar area konten
modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
});