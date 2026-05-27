import { WorkspaceService } from "../workspace-service.js";
import { updateWorkspaceNameUI, updateSwitcherUI } from "../ui/workspace-ui.js";
import { setupGlobalSocket } from "../../ws/request-socket.js"; // Sesuaikan path-nya

export class WorkspaceController {
    constructor(ui, State, { loadCollectionsCallback, hydrateStateCallback }) {
        this.ui = ui;
        this.State = State;
        this.onLoadCollections = loadCollectionsCallback;
        this.onHydrateState = hydrateStateCallback;
        this.menu = null;

        // Inisialisasi BroadcastChannel di sini
        this.bc = new BroadcastChannel('workspace_channel');
        this.setupBroadcastListener();
    }


    setupBroadcastListener() {
        this.bc.onmessage = async (event) => {
            console.log("[DEBUG BROADCAST] Menerima event:", event.data);
            const { type, id, data } = event.data;
            const ensureStateReady = async () => {
                let retries = 0;
                while ((!this.State.workspaceList?.length) && retries < 10) {
                    await new Promise(r => setTimeout(r, 200));
                    retries++;
                }
            };

            if (type === 'SWITCH_WORKSPACE') {
                if (Number(this.State.workspaceId) === Number(id)) return;
                await ensureStateReady();
                this.syncWorkspaceData(id, data);
                // Kita panggil callback dari luar untuk connect socket
                if (this.onSwitchWorkspace) this.onSwitchWorkspace(id);
            } else if (type === 'SYNC_DATA_GLOBAL' || type === 'DATA_UPDATED') {
                await ensureStateReady();
                this.syncWorkspaceData(id, data);
            }
            else if (type === 'WORKSPACE_CREATED') {
                const exists = this.State.workspaceList.find(w => Number(w.id) === Number(id));
                if (!exists) {
                    this.State.workspaceList.push(data); // Tambahkan ke array
                    this.loadWorkspaceSwitcher();       // Re-render dropdown
                }
            }
            else if (type === 'WORKSPACE_DELETED') {
                // 1. Update State list terlebih dahulu
                this.State.workspaceList = this.State.workspaceList.filter(w => Number(w.id) !== Number(id));
                
                // 2. Refresh Dropdown agar opsi yang terhapus hilang dari DOM
                this.loadWorkspaceSwitcher(); 
                
                // 3. Cek jika tab ini sedang membuka workspace yang dihapus
                if (Number(this.State.workspaceId) === Number(id)) {
                    if (this.State.workspaceList.length > 0) {
                        // Pindah ke workspace pertama yang tersedia
                        await this.handleWorkspaceSwitch(this.State.workspaceList[0].id);
                    } else {
                        // Jika workspace habis, reset UI
                        this.State.workspaceId = null;
                        this.State.workspace = null;
                        this.ui.activeWorkspaceName.textContent = "No Workspace";
                    }
                }
            }
        };
    }

    broadcastSwitch(id) {
        this.bc.postMessage({ type: 'SWITCH_WORKSPACE', id });
    }

    async loadFlow() {
        try {
            const list = await WorkspaceService.getMyWorkspaces();
            this.State.workspaceList = list;

            const id = this.State.workspaceId || (list.length ? list[0].id : null);
            if (!id) return;

            const ws = await WorkspaceService.getWorkspace(id);
            this.State.workspaceId = id;
            this.State.workspace = ws;

            this.renderActiveWorkspace(ws);
            await this.loadWorkspaceSwitcher();
            
            if (this.onHydrateState) this.onHydrateState(ws?.data || {});
            if (this.onLoadCollections) await this.onLoadCollections(id);

            window.dispatchEvent(new CustomEvent("workspace:changed", { detail: { id } }));
        } catch (err) {
            console.error("Gagal load flow:", err);
        }
    }

syncWorkspaceData(id, newData) {
    // 1. Update List di State (Pusat kebenaran)
    const wsInList = this.State.workspaceList?.find(w => Number(w.id) === Number(id));
    if (wsInList) {
        // Gabungkan objek agar properti lama tidak hilang (Gunakan spread operator)
        Object.assign(wsInList, { ...wsInList, ...newData });
        
        // 2. Update UI Dropdown (DOM Manipulation langsung)
        const select = this.ui.workspaceSwitcher;
        if (select) {
            const option = Array.from(select.options).find(o => o.value == id);
            if (option) {
                option.textContent = wsInList.name;
            }
        }
    }

    // 3. Update State aktif jika ini workspace yang sedang dibuka
    if (Number(this.State.workspaceId) === Number(id)) {
        if (this.State.workspace) {
            this.State.workspace = { ...this.State.workspace, ...newData };
        }
        // Force re-render dengan data terbaru
        this.renderActiveWorkspace(this.State.workspace);
    }
}

    // Tambahkan ini di WorkspaceController
async silentSwitch(id) {
    // 1. Update State
    this.State.workspaceId = id;
    const ws = await WorkspaceService.getWorkspace(id);
    this.State.workspace = ws;
    
    // 2. Update UI Nama saja
    this.renderActiveWorkspace(ws);
    
    // 3. Update Dropdown (pilih option-nya)
    const select = this.ui.workspaceSwitcher;
    if (select) select.value = id;
    
    console.log("[SILENT] Workspace berpindah ke", id);
}

    async refreshDataOnly(id) {
        try {
            const ws = await WorkspaceService.getWorkspace(id);
            this.State.workspace = ws;
            this.renderActiveWorkspace(ws); // Update UI Nama saja
            if (this.onHydrateState) this.onHydrateState(ws?.data || {});
            if (this.onLoadCollections) await this.onLoadCollections(id);
            // HAPUS dispatchEvent di sini!
        } catch (err) { console.error(err); }
    }

    renderActiveWorkspace(ws) {
        const target = this.State.workspaceList?.find(w => Number(w.id) === Number(this.State.workspaceId)) 
                || this.State.workspace || ws;
        const name = target?.name || target?.data?.name || "Unnamed Workspace";

        updateWorkspaceNameUI(name);
    }
    async loadWorkspaceSwitcher() {
        updateSwitcherUI(this.State.workspaceList, this.State.workspaceId, (id) => this.handleWorkspaceSwitch(id));
    }

    // Tambahkan wrapper untuk UI
    handleRenameRequest(currentName) {
        const name = prompt("New name:", currentName);
        if (name) this.updateName(this.State.workspaceId, name);
    }

    async handleDeleteRequest() {
        if (!confirm("Delete this workspace?")) return;
        
        try {
            const idToDelete = this.State.workspaceId;
            await WorkspaceService.deleteWorkspace(idToDelete);
            
            // 1. Broadcast ke tab lain
            this.bc.postMessage({ type: 'WORKSPACE_DELETED', id: idToDelete });
    
            // 2. Lakukan loadFlow untuk memperbarui State.workspaceList dari server
            await this.loadFlow(); 
            
            // 3. Jika setelah loadFlow ternyata list kosong, reset UI
            if (this.State.workspaceList.length === 0) {
                this.ui.activeWorkspaceName.textContent = "No Workspace";
                this.ui.workspaceSwitcher.innerHTML = "";
            }
            if (this.State.workspaceList.length > 0) {
                // Pindah ke workspace pertama yang tersedia
                const nextId = this.State.workspaceList[0].id;
                await this.handleWorkspaceSwitch(nextId);
            }
        } catch (err) {
            console.error("Gagal hapus:", err);
        }
    }

async handleWorkspaceSwitch(id) {
    try {
        // 1. Ambil data saja
        const ws = await WorkspaceService.getWorkspace(id);
        this.State.workspaceId = id;
        this.State.workspace = ws;
        
        // 2. Update UI
        this.renderActiveWorkspace(ws);
        
        // 3. Update Dropdown agar terpilih (PENTING untuk visual)
        const select = this.ui.workspaceSwitcher;
        if (select) select.value = id;

        // 4. Update data aplikasi tanpa memicu event baru
        if (this.onHydrateState) this.onHydrateState(ws?.data || {});
        
        window.dispatchEvent(new CustomEvent("workspace:changed", { detail: { id } }));
    } catch (err) { console.error(err); }
}


// Di dalam class WorkspaceController
initSocket() {
    // Memulai koneksi dan menentukan apa yang terjadi saat pesan datang
    setupGlobalSocket(this.State.workspaceId, (payload) => {
        // Ini adalah callback yang dipanggil saat ada pesan dari server
        this.handleSocketMessage(payload);
    });
}


handleSocketMessage(payload) {
    const targetId = Number(payload.workspace_id);
    
    if (payload.type === 'WORKSPACE_UPDATED') {
        // 1. Update diri sendiri
        this.syncWorkspaceData(targetId, payload.data);
        
        // 2. KASIH TAHU TAB LAIN!
        const bc = new BroadcastChannel('workspace_channel');
        bc.postMessage(payload); // Kirim seluruh payload asli
        bc.close(); // Tutup setelah kirim
        this.loadFlow();
    }
    
}


async createNewWorkspace() {
    const name = prompt("Workspace name?");
    if (!name) return;
    
    try {
        // 1. Buat workspace baru
        const newWorkspace = await WorkspaceService.createWorkspace(name);
        
        // 2. Set ID baru agar loadFlow otomatis membuka workspace ini
        if (newWorkspace?.id) {
            this.State.workspaceId = newWorkspace.id;
        }
        
        // 3. Reload data di tab ini
        await this.loadFlow();
        
        // 4. BERITAHU TAB LAIN (Broadcast ke semua tab)
        // Kita kirim pesan agar tab lain juga mengupdate daftar workspace mereka
        this.bc.postMessage({ 
            type: 'WORKSPACE_CREATED', // Atau buat type baru 'WORKSPACE_CREATED'
            id: newWorkspace.id, 
            data: newWorkspace 
        });
        
    } catch (err) { 
        console.error("Gagal buat workspace:", err);
        alert("Gagal membuat workspace"); 
    }
}

    async updateName(id, newName) {
        // 1. Update ke Server
        await WorkspaceService.updateWorkspace(id, { name: newName });
        
        // 2. Update State utama
        if (this.State.workspace) this.State.workspace.name = newName;
    
        // 3. Update State List (PENTING: Agar renderActiveWorkspace tidak ambil data lama)
        const wsInList = this.State.workspaceList?.find(w => Number(w.id) === Number(id));
        if (wsInList) wsInList.name = newName;

        // 4. PENTING: Broadcast ke Tab B agar mereka juga update
        const bc = new BroadcastChannel('workspace_channel');
        bc.postMessage({ 
            type: 'SYNC_DATA_GLOBAL', 
            id: id, 
            data: { name: newName } 
        });
        bc.close();
    }

syncUITitle(id, newName) {
    // 1. Update Nama Aktif
    const el = this.ui.activeWorkspaceName;
    if (el) el.textContent = newName;
    
    // 2. Update Dropdown
    const select = this.ui.workspaceSwitcher;
    if (select) {
        const opt = Array.from(select.options).find(o => o.value == id);
        if (opt) opt.textContent = newName;
    }
    
    // 3. Pastikan State juga terupdate agar tidak kembali ke nama lama saat refresh
    if (this.State.workspaceId == id && this.State.workspace) {
        this.State.workspace.name = newName;
    }
}
    initWorkspaceContextMenu() {
        const el = this.ui.activeWorkspaceName;
        if (!el) return;
        if (!this.menu) {
            this.menu = document.createElement("div");
            Object.assign(this.menu.style, { position: "fixed", display: "none", background: "#1e1e1e", border: "1px solid #333", zIndex: "9999" });
            document.body.appendChild(this.menu);
        }
        el.oncontextmenu = (e) => {
            e.preventDefault();
            this.menu.innerHTML = `<div style="padding:10px; cursor:pointer" id="renameWS">Rename</div><div style="padding:10px; cursor:pointer" id="deleteWS">Delete</div>`;
            this.menu.style.left = `${e.clientX}px`; this.menu.style.top = `${e.clientY}px`; this.menu.style.display = "block";
            
            document.getElementById("renameWS").onclick = async () => {
                const name = prompt("New name:", el.textContent);
                if (name) {
                    await this.updateName(this.State.workspaceId, name);
                }
            };
            document.getElementById("deleteWS").onclick = async () => {
                if (confirm("Delete?")) await WorkspaceService.deleteWorkspace(this.State.workspaceId);
                await this.loadFlow();
            };
        };
        document.onclick = () => this.menu.style.display = "none";
    }
}