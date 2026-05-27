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

workspaceCtrl.initSocket();

let currentSocket = null;
let currentConnectedId = null; 

function connectSocket(id) {
    // Jika ID sama dan socket masih hidup, jangan lakukan apa-apa
    if (currentConnectedId === id && currentSocket?.readyState === WebSocket.OPEN) return;

    // Bersihkan koneksi lama dengan benar
    if (currentSocket) {
        // Hapus handler agar tidak trigger re-render saat socket mati
        currentSocket.onmessage = null; 
        currentSocket.onclose = null;
        currentSocket.close();
        currentSocket = null;
    }

    console.log(`[DEBUG] Memulai socket BARU untuk: ${id}`);
    currentSocket = setupGlobalSocket(id, (payload) => {
        workspaceCtrl.handleSocketMessage(payload);
    });

    currentConnectedId = id;
}

document.addEventListener("DOMContentLoaded", async () => {
    initWorkspaceUI(workspaceCtrl);
    const allowed = await guardCollaborationAccess();
    if (allowed) await workspaceCtrl.loadFlow();
});

// Listener dari Workspace Controller
window.addEventListener("workspace:changed", (event) => {
    connectSocket(event.detail.id);
    workspaceCtrl.broadcastSwitch(event.detail.id);
});