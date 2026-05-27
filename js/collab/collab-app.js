import { WorkspaceController } from "./controller/workspace-controller.js";
import { initWorkspaceUI } from "./ui/workspace-ui.js";
import { guardCollaborationAccess } from "./collab-auth-guard.js";
import { setupGlobalSocket } from '../ws/request-socket.js';

function loadCollections(id) { console.log("Load collections for", id); }
function hydrateState(data) { console.log("Hydrate data", data); }

const ui = {
    workspaceSwitcher: document.getElementById("workspaceSwitcher"),
    workspaceTitle: document.getElementById("workspaceTitle"),
    activeWorkspaceName: document.getElementById("activeWorkspaceName")
};
const State = { workspaceId: null, workspace: null, workspaceList: [] };

const workspaceCtrl = new WorkspaceController(ui, State, {
    loadCollectionsCallback: loadCollections,
    hydrateStateCallback: hydrateState
});

workspaceCtrl.onSwitchWorkspace = (id) => connectSocket(id);

let currentSocket = null;
let currentConnectedId = null; 

function connectSocket(id) {
    if (!id) return;
    if (currentConnectedId === id && currentSocket?.readyState === WebSocket.OPEN) return;

    console.log(`[DEBUG] Memulai socket BARU untuk: ${id}`);
    
    currentSocket = setupGlobalSocket(id, (payload) => {
        workspaceCtrl.handleSocketMessage(payload);
    });

    // Tambahkan ini untuk ketahanan jaringan
    currentSocket.onclose = () => {
        console.warn("[SOCKET] Koneksi terputus, mencoba reconnect dalam 3 detik...");
        setTimeout(() => {
            if (workspaceCtrl.State.workspaceId === id) {
                currentSocket = null; // Reset agar bisa di-reconnect
                connectSocket(id);
            }
        }, 3000);
    };

    currentConnectedId = id;
}

document.addEventListener("DOMContentLoaded", async () => {
    initWorkspaceUI(workspaceCtrl);
    const allowed = await guardCollaborationAccess();
    if (allowed) {
        // loadFlow akan men-trigger event "workspace:changed"
        // sehingga connectSocket akan dipanggil secara otomatis
        await workspaceCtrl.loadFlow();
    }
});

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        console.log("Tab aktif kembali, memastikan socket hidup...");
        if (workspaceCtrl.State.workspaceId) {
            connectSocket(workspaceCtrl.State.workspaceId);
        }
    }
});

// Listener dari Workspace Controller
window.addEventListener("workspace:changed", (event) => {
    connectSocket(event.detail.id);
    workspaceCtrl.broadcastSwitch(event.detail.id);
});