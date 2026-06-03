import { EnvService } from "../env-service.js";
import { EnvUI } from "../ui/env-ui.js";

export class EnvController {
    constructor(State) {
        this.State = State;
        this.bc = new BroadcastChannel('env_sync_channel');
        this.setupBroadcastListener();
    }


    async init(container, workspaceId) {
        console.log("DEBUG: EnvController init, workspaceId:", workspaceId);
        
        if (!workspaceId) {
            console.error("ERROR: workspaceId kosong di EnvController!");
            return;
        }
        
        this.container = container;
        this.workspaceId = workspaceId;
        
        // Fetch data awal
        this.State.environments = await EnvService.getByWorkspace(workspaceId);
        this.render();
    }

    render() {
        if (!this.container) return;
        EnvUI.renderList(this.State.environments, this.container, {
            onUpdate: (id, data) => this.update(id, data),
            onDelete: (id) => this.delete(id)
        }, 'env');
    }

    async update(id, data) {
        const updated = await EnvService.update(id, data);
        if (updated) {
            this.bc.postMessage({ type: 'ENV_UPDATED', data: updated });
            const idx = this.State.environments.findIndex(e => e.id === id);
            if (idx !== -1) this.State.environments[idx] = updated;
        }
    }

    async delete(id) {
        const success = await EnvService.delete(id);
        if (success) {
            this.bc.postMessage({ type: 'ENV_DELETED', id });
            this.State.environments = this.State.environments.filter(e => e.id !== id);
            EnvUI.removeRow(id);
        }
    }

    setupBroadcastListener() {
        this.bc.onmessage = (event) => {
            const { type, data, id } = event.data;
            if (type === 'ENV_UPDATED') {
                const idx = this.State.environments.findIndex(e => e.id === data.id);
                if (idx !== -1) this.State.environments[idx] = data;
                this.render();
            } else if (type === 'ENV_DELETED') {
                this.State.environments = this.State.environments.filter(e => e.id !== id);
                this.render();
            }
        };
    }
}