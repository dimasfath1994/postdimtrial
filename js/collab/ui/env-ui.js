// js/ui/env-ui.js
import { EnvService } from "../env-service.js";
import { GlobalService } from "../global-service.js";

export class EnvUI {
    /**
     * @param {Array} vars - List variabel (environment atau global)
     * @param {HTMLElement} container - Container target (#envList)
     * @param {Object} handlers - Event handlers (onUpdate, onDelete)
     * @param {string} type - 'env' atau 'global'
     */
    static renderList(vars, container, handlers, type) {
        const title = type === 'env' ? 'Workspace Variables' : 'Global Variables';
        
        container.innerHTML = `
            <div style="margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 13px; font-weight: bold; color: #666;">${title}</span>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                    <tr style="border-bottom: 1px solid #ddd; text-align: left; color: #666;">
                        <th style="padding: 8px 4px; width: 40%;">Key</th>
                        <th style="padding: 8px 4px; width: 50%;">Value</th>
                        <th style="padding: 8px 4px; width: 10%;"></th>
                    </tr>
                </thead>
                <tbody id="${type}-list-body"></tbody>
            </table>
        `;

        const body = container.querySelector(`#${type}-list-body`);
        if (vars && vars.length > 0) {
            vars.forEach(v => body.appendChild(this.createRow(v, handlers, type)));
        }
    }

    static createRow(v, handlers, type) {
        const row = document.createElement('tr');
        row.className = 'env-row';
        row.dataset.id = v.id;

        const inputStyle = "width: 100%; border: 1px solid #ddd; padding: 4px; border-radius: 3px; font-size: 12px;";
        
        const keyField = type === 'env' ? 'env_key' : 'global_key';
        const valField = type === 'env' ? 'env_value' : 'global_value';

        row.innerHTML = `
            <td style="padding: 4px;">
                <input type="text" value="${v[keyField] || ''}" class="v-key" style="${inputStyle}">
            </td>
            <td style="padding: 4px;">
                <input type="text" value="${v[valField] || ''}" class="v-val" style="${inputStyle}">
            </td>
            <td style="text-align: center;">
                <button class="v-delete" style="border:none; background:none; cursor:pointer; color:#ff4d4f; font-size: 16px;">×</button>
            </td>
        `;

        const triggerUpdate = () => {
            const payload = type === 'env' 
                ? { env_key: row.querySelector('.v-key').value, env_value: row.querySelector('.v-val').value }
                : { global_key: row.querySelector('.v-key').value, global_value: row.querySelector('.v-val').value };
            
            handlers.onUpdate(v.id, payload);
        };

        row.querySelectorAll('input').forEach(input => {
            input.addEventListener('blur', triggerUpdate);
        });

        row.querySelector('.v-delete').onclick = () => {
            handlers.onDelete(v.id);
        };

        return row;
    }

    /**
     * Menangani logika Add langsung di UI Layer
     * @param {Object} controllers - { envCtrl, globalCtrl }
     * @param {Object} State - State aplikasi
     */
    static setupAddHandler(controllers, State) {
        const btn = document.getElementById('addEnv');
        if (!btn) return;

        btn.onclick = async () => {
            const type = document.getElementById('addTypeSelect').value;
            const key = document.getElementById('envKey').value.trim();
            const value = document.getElementById('envValue').value.trim();
            const wsId = State.activeWorkspaceId || State.workspaceId;

            if (!key) return alert("Key is required");

            try {
                if (type === 'env') {
                    if (!wsId) return alert("Pilih workspace terlebih dahulu!");
                    await EnvService.create(wsId, key, value);
                    await controllers.envCtrl.init(document.getElementById('envList-workspace'), wsId);
                } else {
                    await GlobalService.create(key, value);
                    await controllers.globalCtrl.init(document.getElementById('envList-global'));
                }

                // Reset input
                document.getElementById('envKey').value = '';
                document.getElementById('envValue').value = '';
            } catch (err) {
                console.error("Gagal menambahkan variabel:", err);
                alert("Gagal menambahkan variabel");
            }
        };
    }

    static removeRow(id) {
        const row = document.querySelector(`.env-row[data-id="${id}"]`);
        if (row) row.remove();
    }
}