import { GlobalService } from "../global-service.js";
import { EnvUI } from "../ui/env-ui.js";

export class GlobalController {
    constructor(State) {
        this.State = State;
    }

    async init(container) {
        this.container = container;
        this.State.globals = await GlobalService.getAll();
        if (this.container) { // Hanya render jika container tersedia
            this.render();
        }
    }

    render() {
        if (!this.container) return;
        EnvUI.renderList(this.State.globals, this.container, {
            onUpdate: (id, data) => this.update(id, data),
            onDelete: (id) => this.delete(id)
        }, 'global');
    }

    async update(id, data) {
        const updated = await GlobalService.update(id, data);
        if (updated) {
            const idx = this.State.globals.findIndex(g => g.id === id);
            if (idx !== -1) this.State.globals[idx] = updated;
        }
    }

    async delete(id) {
        const success = await GlobalService.delete(id);
        if (success) {
            this.State.globals = this.State.globals.filter(g => g.id !== id);
            EnvUI.removeRow(id);
        }
    }
}