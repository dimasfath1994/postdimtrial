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

import { DraftServerController } from "./controller/draft-server-controller.js";

import { EnvUI } from './ui/env-ui.js';

import { PMSandbox } from './services/pm-sandbox.js';

import { RequestFormatter } from './services/request-formatter.js';
import { VariableResolver } from './services/variable-resolver.js';
import { RequestDispatcher } from './services/request-dispatcher.js';
import { ResponseHandler } from './services/response-handler.js';

import "./controller/export-controller.js";

import { ImportController } from "./controller/import-controller.js";

import { Auth } from "../auth.js";

import { initRequestPicker } from './ui/request-picker.js';

import { initDraftPicker } from './ui/request-picker-draft.js';

import { initInviteModal } from "./controller/invite-controller.js";


import { initWorkspaceModal, showWorkspaceModal } from "./ui/workspace-management.js";

import { GraphqlController } from "./controller/graphql-controller.js";
import { GraphqlUI } from './ui/graphql-ui.js';
import { GrpcController } from "./controller/grpc-controller.js";
import { RequestModeController } from './controller/request-mode-controller.js';

const isTauri = window.__TAURI_INTERNALS__ !== undefined;

if (isTauri) {
    // Sembunyikan tombol jika user sudah pakai versi desktop
    document.getElementById('downloadAppBtn').style.display = 'none';
} else {
    // Jika di browser, arahkan ke GitHub Releases
    document.getElementById('downloadAppBtn').addEventListener('click', () => {
        window.open('https://github.com/dimasfath1994/postdimtrial/releases/latest/download/app.exe', '_blank');
    });
}

ImportController.initUIListeners(() => {
    console.log("Import selesai, UI akan di-refresh...");
    location.reload(); 
});




function hydrateState(data) { console.log("Hydrate data", data); }

const ui = {
    workspaceSwitcher: document.getElementById("workspaceSwitcher"),
    workspaceTitle: document.getElementById("workspaceTitle"),
    activeWorkspaceName: document.getElementById("activeWorkspaceName"),
    collectionList: document.getElementById("collectionList"),
    sendRequest: document.getElementById("send")
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
    globals: [],
    requestStates: {}
 };
 window.COLLAB_STATE = State;

const dispatcher = new SocketDispatcher();



// =============== INITIALIZE GRAPHQL & GRPC CONTROLLER ================
const graphqlCtrl = new GraphqlController(State);
const grpcCtrl = new GrpcController(State);

window.graphqlCtrl = graphqlCtrl;
window.grpcCtrl = grpcCtrl;


// =============== INITIALIZE REQUEST-PARAM-CONTROLLER ================
const paramCtrl = new RequestParamController(State);

// =============== INITIALIZE BODY-PARAM-CONTROLLER ================
const bodyParamCtrl = new RequestBodyParamController(State);
window.bodyParamCtrl = bodyParamCtrl;

// =============== INITIALIZE REQUEST-HEADER-CONTROLLER ================
const headerCtrl = new RequestHeaderController(State);

//=============== INITIALIZE TAB REQUEST ================
const tabCtrl = new TabController(ui, null, State, paramCtrl, headerCtrl, graphqlCtrl, grpcCtrl);

initBodyTabs(bodyParamCtrl, tabCtrl, graphqlCtrl);

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
    document.body.dataset.currentWsId = id;
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
//=============== INITIALIZE DRAFT SERVER CONTROLLER ================
const draftServerCtrl = new DraftServerController(State, {
    requestController: requestCtrl,
    requestParamController: paramCtrl,
    requestHeaderController: headerCtrl,
    requestBodyParamController: bodyParamCtrl,
    graphqlController: graphqlCtrl,
    grpcController: grpcCtrl
});

// Penting: Daftarkan ke window agar bisa diakses jika dibutuhkan
window.draftServerCtrl = draftServerCtrl;

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
dispatcher.register('GRAPHQL_', graphqlCtrl);
dispatcher.register('GRPC_', grpcCtrl);


// Saat inisialisasi socket, cukup panggil dispatcher.dispatch
function initSocket(workspaceId) {
    setupGlobalSocket(workspaceId, (payload) => {
        dispatcher.dispatch(payload);
    });
}


let currentSocket = null;
let currentConnectedId = null; 
let isConnecting = false;


function updateBodyMode(mode) {
    const rawBox = document.getElementById('rawBodyBox');
    const formBox = document.getElementById('formDataBox');
    const urlBox = document.getElementById('urlencodedBox');
    const gqlBox = document.getElementById('graphqlBox');

    if (rawBox) rawBox.classList.toggle('hidden', mode !== 'raw' && mode !== 'none');
    if (formBox) formBox.classList.toggle('hidden', mode !== 'form-data');
    if (urlBox) urlBox.classList.toggle('hidden', mode !== 'urlencoded');
    if (gqlBox) gqlBox.classList.toggle('hidden', mode !== 'graphql');

    // Re-layout Monaco Editor saat tab GraphQL diaktifkan
    if (mode === 'graphql') {
        GraphqlUI.layout();
    }
} 


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
        RequestModeController.init();
        await envCtrl.init(null, wsId); // Pass null karena kita tidak butuh render ke UI dulu
        await globalCtrl.init(null);

        const inviteBtn = document.getElementById('inviteBtn');
        if (inviteBtn) {
            initInviteModal(); // Ganti 1 dengan ID workspace yang benar
        } else {
            console.error("Tombol inviteBtn tidak ditemukan di HTML!");
        }

        initWorkspaceModal();
    }
});

// window.addEventListener('request-tab-switched', async (e) => {
//     const requestId = e.detail.requestId;
//     console.log(`[SYNC] Menyiapkan data untuk request: ${requestId}`);

//     const isDraft = String(requestId).startsWith('draft_');

//     // JIKA DRAFT, KITA SKIP SYNC DARI SERVER/CONTROLLER PUSAT
//     // Karena Draft harusnya hanya bergantung pada data lokal (DataBridge)
//     if (isDraft) {
//         console.log(`[SYNC] Request ${requestId} adalah Draft, melewati sync server.`);
//         // let tes = DataBridge.getAll(requestId);
//         // console.log(`[SYNC] Request draft`, tes);
//         return; // Keluar agar tidak mengganggu UI yang sudah di-load oleh TabController
//     }

//     // Jika bukan draft, silakan lanjut sinkronisasi seperti biasa
//     await Promise.all([
//         bodyParamCtrl ? bodyParamCtrl.syncWithRequest(requestId) : Promise.resolve(),
//         headerCtrl ? headerCtrl.init(requestId, document.getElementById('headersBox'), isDraft) : Promise.resolve(),
//         paramCtrl ? paramCtrl.init(requestId, document.getElementById('paramsBox'), isDraft) : Promise.resolve()
//     ]);
    
//     console.log(`[SYNC] Semua data untuk ${requestId} berhasil dimuat ke State.`);
// });

window.addEventListener('request-tab-switched', async (e) => {
    const requestId = e.detail.requestId;
    console.log(`[SYNC] Menyiapkan data untuk request: ${requestId}`);

    // ================= PEMULIHAN / ISOLASI RESPONSE API (ALUR POSTMAN) =================
    // Ambil data dari RAM lokal, jika belum ada buatkan struktur default kosongnya
    const runtimeState = State.requestStates?.[requestId] || { isSending: false, response: null };

    // 1. Pulihkan kondisi tombol send untuk tab yang baru dibuka ini
    tabCtrl.updateSendButtonUI();

    // 2. Pulihkan data panel response milik tab ini atau bersihkan jika kosong
    if (runtimeState.response) {
        // Set window.latestResponse ke data tab ini agar sub-tab Body/Headers membaca data yang benar
        window.latestResponse = runtimeState.response; 
        ResponseHandler.render(runtimeState.response);
    } else {
        // Jika tab ini belum pernah menembak API, bersihkan layar response total agar tidak bocor dari tab sebelumnya
        window.latestResponse = null;
        ResponseHandler.clear();
    }
    // ==================================================================================

    const isDraft = String(requestId).startsWith('draft_');

    // JIKA DRAFT, KITA SKIP SYNC DARI SERVER/CONTROLLER PUSAT
    if (isDraft) {
        console.log(`[SYNC] Request ${requestId} adalah Draft, melewati sync server.`);
        return; 
    }

    // Jika bukan draft, silakan lanjut sinkronisasi parameter DB seperti biasa
    await Promise.all([
        bodyParamCtrl ? bodyParamCtrl.syncWithRequest(requestId) : Promise.resolve(),
        headerCtrl ? headerCtrl.init(requestId, document.getElementById('headersBox'), isDraft) : Promise.resolve(),
        paramCtrl ? paramCtrl.init(requestId, document.getElementById('paramsBox'), isDraft) : Promise.resolve(),
        graphqlCtrl ? graphqlCtrl.init(requestId, document.getElementById('graphqlBox'), isDraft) : Promise.resolve(),
        grpcCtrl ? grpcCtrl.init(requestId, document.getElementById('grpcBox'), isDraft) : Promise.resolve()
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


// document.getElementById('send').addEventListener('click', async () => {
//     try{
//         ui.sendRequest.disabled = true;
//         ui.sendRequest.textContent = "Sending...";
//         // 1. Kumpulkan data
//         const rawData = await RequestFormatter.collectFromUI(State);
//         const scripts = monacoCtrl.getValues(); 
        
//         // Gabungkan script
//         const finalData = {
//             ...rawData,
//             pre_script: scripts.pre_script,
//             post_script: scripts.post_script
//         };

//         // 2. Resolve variabel
//         const resolvedData = VariableResolver.resolveRequest(finalData, State);
        
//         // 3. Kirim Request
//         const response = await RequestDispatcher.send(resolvedData);
//         ResponseHandler.render(response);

//         // 4. EKSKUSI SCRIPT (Hanya jika ada isi)
//         // Trim() memastikan jika user cuma isi spasi/enter, tetap dianggap kosong
//         if (resolvedData.post_script && resolvedData.post_script.trim().length > 0) {
//             console.log("[PMSandbox] Ditemukan script, menjalankan...");
            
//             await PMSandbox.execute(
//                 resolvedData.post_script, 
//                 response, 
//                 State, 
//                 envCtrl
//             );
//         } else {
//             console.log("[PMSandbox] Tidak ada post-script, dilewati.");
//         }

//     }
//     catch(err){
//         console.error(err);
//     }
//     finally {
//         ui.sendRequest.disabled = false;
//         ui.sendRequest.textContent = "Send Request";
//     }
// });

document.getElementById('send').addEventListener('click', async () => {
    // Ambil ID tab yang sedang aktif saat tombol diklik
    const activeId = tabCtrl.activeTabId; 
    if (!activeId) return;

    // Inisialisasi object RAM untuk tab ini jika belum ada
    State.requestStates[activeId] = State.requestStates[activeId] || { isSending: false, response: null };

    try {
        // 1. Set status sending ke true khusus untuk tab ini, lalu update UI tombol
        State.requestStates[activeId].isSending = true;
        tabCtrl.updateSendButtonUI(); 

        // 2. Kumpulkan data dari UI
        const rawData = await RequestFormatter.collectFromUI(State);
        const scripts = monacoCtrl.getValues(); 
        
        const finalData = {
            ...rawData,
            pre_script: scripts.pre_script,
            post_script: scripts.post_script
        };

        // 3. Resolve variabel environment/global
        const resolvedData = VariableResolver.resolveRequest(finalData, State);
        
        // 4. Kirim Request ke Server API Target
        const response = await RequestDispatcher.send(resolvedData);
        
        // 5. Simpan hasil response ke RAM milik tab ini
        State.requestStates[activeId].response = response;

        // GUARD: Hanya render ke layar jika user MASIH melihat tab ini
        // (Mencegah response tab A menimpa layar jika user pindah ke tab B saat loading)
        if (tabCtrl.activeTabId === activeId) {
            window.latestResponse = response; // Sinkronkan ke window global untuk sub-tab response
            ResponseHandler.render(response);
        }

        // 6. Eksekusi Post-Script (Jika ada)
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

    }
    catch(err) {
        console.error(err);
        // Jika request gagal total (misal network error), simpan status error ke RAM tab ini
        const errorResponse = { error: true, message: err.message || "Request Failed" };
        State.requestStates[activeId].response = errorResponse;
        
        if (tabCtrl.activeTabId === activeId) {
            window.latestResponse = errorResponse;
            ResponseHandler.render(errorResponse);
        }
    }
    finally {
        // 7. Kembalikan status sending ke false untuk tab ini
        State.requestStates[activeId].isSending = false;
        
        // Jika user masih di tab ini, pulihkan tombol Send
        if (tabCtrl.activeTabId === activeId) {
            tabCtrl.updateSendButtonUI();
        }
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

initDraftPicker(draftServerCtrl, State, folderCtrl, State.workspaceId);

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



function logout() {
  Auth.logout?.();
  window.location.replace("./");
}

document.getElementById("collabLogoutBtn")
    ?.addEventListener("click", logout);


    document.getElementById('manageWorkspaceBtn').addEventListener('click', () => {
        showWorkspaceModal(State.workspaceId); // Ganti dengan variabel ID workspace yang aktif
    });