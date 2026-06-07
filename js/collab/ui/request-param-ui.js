// js/ui/request-param-ui.js

export class RequestParamUI {
    static renderParams(params, container, handlers) {
        if (!container) {
            console.error("RequestParamUI: Container element is missing (null/undefined)!");
            return; 
        }
        container.innerHTML = `
            <div style="margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 13px; font-weight: bold; color: #666;">Query Parameters</span>
                <div>
                    <button id="save-bulk-btn" style="display: none; background: #007bff; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 12px; margin-right: 5px;">Save</button>
                    <button id="toggle-bulk-btn" style="background: none; border: none; color: #007bff; cursor: pointer; font-size: 12px;">Bulk Edit</button>
                </div>
            </div>
            <div id="table-view">
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <thead>
                        <tr style="border-bottom: 1px solid #ddd; text-align: left; color: #666;">
                            <th style="padding: 8px 4px; width: 30px;"></th>
                            <th style="padding: 8px 4px; width: 30%;">Key</th>
                            <th style="padding: 8px 4px; width: 30%;">Value</th>
                            <th style="padding: 8px 4px;">Description</th>
                            <th style="padding: 8px 4px; width: 40px;"></th>
                        </tr>
                    </thead>
                    <tbody id="params-body"></tbody>
                </table>
                <button id="add-param-btn" style="margin-top: 10px; background: none; border: none; color: #007bff; cursor: pointer; font-size: 13px;">+ Add Parameter</button>
            </div>
            <div id="bulk-view" style="display: none;">
                <textarea id="param-bulk-textarea" class="param-bulk-textarea" style="width: 100%; height: 150px; font-family: monospace; padding: 10px; border: 1px solid #ddd; border-radius: 4px;" placeholder="key:value&#10;key2:value2"></textarea>
            </div>
        `;
    
        // Logic Rendering Table
        const body = container.querySelector('#params-body');
        params.forEach(param => body.appendChild(this.createParamRow(param, handlers)));
    
        // Tombol Add
        container.querySelector('#add-param-btn').onclick = () => {
            if (handlers.onAdd) handlers.onAdd();
        };
    
        // Toggle View & Bulk Logic
        const toggleBtn = container.querySelector('#toggle-bulk-btn');
        const saveBulkBtn = container.querySelector('#save-bulk-btn');
        const tableView = container.querySelector('#table-view');
        const bulkView = container.querySelector('#bulk-view');
        const textarea = container.querySelector('#param-bulk-textarea');
    
        // Di dalam renderParams()
toggleBtn.onclick = () => {
    const isBulk = bulkView.style.display === 'none';
    if (isBulk) {
        // --- INI KUNCI UTAMANYA ---
        // Kita tidak bergantung pada update di belakang layar.
        // Saat user klik, kita ambil data terbaru dari argument `params`
        const text = params.map(p => `${p.key}:${p.value}`).join('\n');
        textarea.value = text;
        
        tableView.style.display = 'none';
        bulkView.style.display = 'block';
        saveBulkBtn.style.display = 'inline-block';
        toggleBtn.textContent = 'Table Edit';
    } else {
        tableView.style.display = 'block';
        bulkView.style.display = 'none';
        saveBulkBtn.style.display = 'none';
        toggleBtn.textContent = 'Bulk Edit';
    }
};
    
        // Handler Save Bulk
        saveBulkBtn.onclick = () => {
            console.log("Tombol Save Bulk ditekan!"); // <--- Cek ini di Console
            if (handlers.onBulkUpdate) {
                handlers.onBulkUpdate(textarea.value);
            } else {
                console.error("Handler onBulkUpdate tidak ditemukan!"); // <--- Cek ini
            }
        };
    }

    static updateBulkText(params) {
        // Cari elemen di seluruh dokumen agar selalu mendapatkan elemen yang aktif di layar
        // Gunakan class agar lebih aman
        const textarea = document.querySelector('.param-bulk-textarea');
        
        if (textarea) {
            textarea.value = params.map(p => `${p.key}:${p.value}`).join('\n');
            console.log("UI: Textarea berhasil diupdate!");
        } else {
            console.error("UI: Textarea .param-bulk-textarea TIDAK DITEMUKAN di DOM!");
        }
    }

    static createParamRow(param, handlers) {
        // Log untuk memastikan data yang masuk memang ada isinya
        console.log("DEBUG: Rendering row dengan data:", param);

        const row = document.createElement('tr');
        row.className = 'param-row';
        row.dataset.id = param.id;

        const inputStyle = "width: 100%; border: 1px solid transparent; padding: 6px; background: transparent; font-size: 13px;";
        
        // Menggunakan || '' untuk memastikan jika data null/undefined, tidak muncul 'undefined' di UI
        row.innerHTML = `
            <td style="text-align: center;"><input type="checkbox" ${param.enabled ? 'checked' : ''} class="param-enabled"></td>
            <td><input type="text" value="${param.key || ''}" placeholder="Key" class="param-key" style="${inputStyle}"></td>
            <td><input type="text" value="${param.value || ''}" placeholder="Value" class="param-value" style="${inputStyle}"></td>
            <td><input type="text" value="${param.description || ''}" placeholder="Description" class="param-desc" style="${inputStyle}"></td>
            <td style="text-align: center;">
                <button class="param-delete" style="border:none; background:none; cursor:pointer; color:#ccc; font-size: 16px;">×</button>
            </td>
        `;

        // Event Listener untuk semua input di baris ini
        row.querySelectorAll('input').forEach(input => {
            input.onfocus = () => input.style.borderColor = "#ddd";
            input.onblur = () => input.style.borderColor = "transparent";
            
            input.addEventListener('change', () => {
                const updatedData = {
                    key: row.querySelector('.param-key').value,
                    value: row.querySelector('.param-value').value,
                    description: row.querySelector('.param-desc').value,
                    enabled: row.querySelector('.param-enabled').checked
                };
                
                console.log("DEBUG: Mengirim update:", updatedData);
                handlers.onUpdate(param.id, updatedData);
            });
        });

        // Event Delete
        row.querySelector('.param-delete').onclick = () => {
            handlers.onDelete(param.id);
        };

        return row;
    }

    static appendNewRow(container, param, handlers) {
        const row = this.createParamRow(param, handlers);
        // Masukkan ke tbody, bukan langsung ke container (karena container sekarang ada tabelnya)
        const body = container.querySelector('#params-body');
        if (body) {
            body.appendChild(row);
        }
        return row;
    }

    static removeParamRow(id) {
        const row = document.querySelector(`.param-row[data-id="${id}"]`);
        if (row) row.remove();
    }
}