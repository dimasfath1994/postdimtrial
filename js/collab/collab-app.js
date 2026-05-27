import { WorkspaceController } from "./controller/workspace-controller.js";
import { initWorkspaceUI } from "./ui/workspace-ui.js";
import { guardCollaborationAccess } from "./collab-auth-guard.js";
import { setupGlobalSocket } from '../ws/request-socket.js';


import { CollectionController } from "./controller/collection-controller.js";
import { renderCollectionSidebar, setupCollectionActions } from "./ui/collection-ui.js";


function hydrateState(data) { console.log("Hydrate data", data); }

const ui = {
    workspaceSwitcher: document.getElementById("workspaceSwitcher"),
    workspaceTitle: document.getElementById("workspaceTitle"),
    activeWorkspaceName: document.getElementById("activeWorkspaceName"),
    collectionList: document.getElementById("collectionList") // Tambahan
};
const State = { 
    workspaceId: null,
    workspace: null,
    workspaceList: [],
    collections: []
 };


 //=============== INITIALIZE WORKSPACE ================
const workspaceCtrl = new WorkspaceController(ui, State, {
    loadCollectionsCallback: loadCollections,
    hydrateStateCallback: hydrateState
});

workspaceCtrl.onSwitchWorkspace = (id) => connectSocket(id);


//=============== INITIALIZE COLLECTION ================
const collectionCtrl = new CollectionController(ui, State, {
    onUpdateUI: (cols) => {
        renderCollectionSidebar(
            document.getElementById('collectionList'), 
            cols, 
            {
                // Cukup panggil method dari instance controller
                onOpenMenu: (e, col) => collectionCtrl.showContextMenu(e, col)
            }
        );
    }
});
setupCollectionActions(collectionCtrl);


let currentSocket = null;
let currentConnectedId = null; 
let isConnecting = false;

function connectSocket(id) {
    // 1. Guard: Tidak perlu melakukan apa-apa jika sudah terhubung
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
            if (currentConnectedId === id) {
                workspaceCtrl.handleSocketMessage(payload);
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
    initWorkspaceUI(workspaceCtrl);
    const allowed = await guardCollaborationAccess();
    if (allowed)
    {
         await workspaceCtrl.loadFlow();
    }
});

// Listener dari Workspace Controller
window.addEventListener("workspace:changed", (event) => {
    connectSocket(event.detail.id);
    workspaceCtrl.broadcastSwitch(event.detail.id);
});

async function loadCollections(id) { 
    console.log("Load collections for", id);
    // Panggil method init yang kita buat di CollectionController
    await collectionCtrl.init(id); 
}