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

import "./controller/export-controller.js";

import { ImportController } from "./controller/import-controller.js";

import { initRequestPicker } from './ui/request-picker.js';


ImportController.initUIListeners(() => {
    console.log("Import selesai, UI akan di-refresh...");
    location.reload(); 
});




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
 window.COLLAB_STATE = State;

const dispatcher = new SocketDispatcher();



// =============== INITIALIZE REQUEST-PARAM-CONTROLLER ================
const paramCtrl = new RequestParamController(State);

// =============== INITIALIZE BODY-PARAM-CONTROLLER ================
const bodyParamCtrl = new RequestBodyParamController(State);
window.bodyParamCtrl = bodyParamCtrl;

// =============== INITIALIZE REQUEST-HEADER-CONTROLLER ================
const headerCtrl = new RequestHeaderController(State);

//=============== INITIALIZE TAB REQUEST ================
const tabCtrl = new TabController(ui, null, State, paramCtrl, headerCtrl);

initBodyTabs(bodyParamCtrl, tabCtrl);

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


window.tabCtrl = tabCtrl;

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

    // 1. Tentukan status isDraft di sini
    const isDraft = String(requestId).startsWith('draft_');

    // 2. Jalankan semua sync dengan mengoper isDraft
    await Promise.all([
        bodyParamCtrl ? bodyParamCtrl.syncWithRequest(requestId) : Promise.resolve(),
        headerCtrl ? headerCtrl.init(requestId, document.getElementById('headersBox'), isDraft) : Promise.resolve(),
        paramCtrl ? paramCtrl.init(requestId, document.getElementById('paramsBox'), isDraft) : Promise.resolve()
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
    const rawData = await RequestFormatter.collectFromUI(State);
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

initRequestPicker(requestCtrl, State, folderCtrl);

// Di dalam event listener button "newTab"
document.getElementById('newTab').addEventListener('click', async () => {
    // 1. Tentukan target koleksi (aktif, atau koleksi pertama, atau null)
    const targetCollectionId = State.activeCollectionId || (State.collections.length > 0 ? State.collections[0].id : null);

    // 2. Buat objek "Draft" lokal (hanya di memori)
    const newDraftRequest = {
        id: 'draft_' + Date.now(), // ID unik sementara
        name: "New Request",
        method: "GET",
        url: "",
        collection_id: targetCollectionId,
        folder_id: null,
        is_draft: true // Flag penting untuk penanda
    };

    // 3. Tambahkan ke state (agar tab bisa merujuk ke request ini)
    //State.requests.push(newDraftRequest);

    // 4. Buka Tab (langsung terbuka tanpa nunggu API)
    tabCtrl.openTab(newDraftRequest);

    console.log("Draft request created locally with collection:", targetCollectionId);
});