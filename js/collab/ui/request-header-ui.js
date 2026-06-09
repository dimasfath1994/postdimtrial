// js/ui/request-header-ui.js

export class RequestHeaderUI {
    static renderHeaders(headers, container, handlers) {
        if (!container) {
            console.error("RequestHeaderUI: Container element is missing (null/undefined)!");
            return; 
        }
        container.innerHTML = `
            <div style="margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 13px; font-weight: bold; color: #666;">Request Headers</span>
                <div>
                    <button id="save-header-bulk-btn" style="display: none; background: #007bff; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 12px; margin-right: 5px;">Save</button>
                    <button id="toggle-header-bulk-btn" style="background: none; border: none; color: #007bff; cursor: pointer; font-size: 12px;">Bulk Edit</button>
                </div>
            </div>
            <div id="header-table-view">
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
                    <tbody id="headers-body"></tbody>
                </table>
                <button id="add-header-btn" style="margin-top: 10px; background: none; border: none; color: #007bff; cursor: pointer; font-size: 13px;">+ Add Header</button>
            </div>
            <div id="header-bulk-view" style="display: none;">
                <textarea id="header-bulk-textarea" style="width: 100%; height: 150px; font-family: monospace; padding: 10px; border: 1px solid #ddd; border-radius: 4px;" placeholder="key:value&#10;key2:value2"></textarea>
            </div>
        `;
    
        // 1. Render baris jika ada data
        const body = container.querySelector('#headers-body');
        if (headers && headers.length > 0) {
            headers.forEach(header => body.appendChild(this.createHeaderRow(header, handlers)));
        }
    
        // 2. Tombol Add (Selalu dipasang event-nya)
        container.querySelector('#add-header-btn').onclick = () => {
            if (handlers.onAdd) handlers.onAdd();
        };
    
        // 3. Toggle View & Bulk Logic
        const toggleBtn = container.querySelector('#toggle-header-bulk-btn');
        const saveBulkBtn = container.querySelector('#save-header-bulk-btn');
        const tableView = container.querySelector('#header-table-view');
        const bulkView = container.querySelector('#header-bulk-view');
        const textarea = container.querySelector('#header-bulk-textarea');
    
        toggleBtn.onclick = () => {
            const isBulk = bulkView.style.display === 'none';
            if (isBulk) {
                const text = headers.map(h => `${h.key}:${h.value}`).join('\n');
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
    
        // 4. Handler Save Bulk
        saveBulkBtn.onclick = () => {
            if (handlers.onBulkUpdate) {
                handlers.onBulkUpdate(textarea.value);
            }
        };
    }

    static updateBulkText(headers) {
        const textarea = document.getElementById('header-bulk-textarea');
        if (textarea) {
            textarea.value = headers.map(h => `${h.key}:${h.value}`).join('\n');
        }
    }

    static createHeaderRow(header, handlers) {
        const row = document.createElement('tr');
        row.className = 'header-row';
        row.dataset.id = header.id;

        const inputStyle = "width: 100%; border: 1px solid transparent; padding: 6px; background: transparent; font-size: 13px;";
        
        row.innerHTML = `
            <td style="text-align: center;"><input type="checkbox" ${header.enabled ? 'checked' : ''} class="header-enabled"></td>
            <td><input type="text" value="${header.key || ''}" placeholder="Key" class="header-key" style="${inputStyle}"></td>
            <td><input type="text" value="${header.value || ''}" placeholder="Value" class="header-value" style="${inputStyle}"></td>
            <td><input type="text" value="${header.description || ''}" placeholder="Description" class="header-desc" style="${inputStyle}"></td>
            <td style="text-align: center;">
                <button class="header-delete" style="border:none; background:none; cursor:pointer; color:#ccc; font-size: 16px;">×</button>
            </td>
        `;

        row.querySelectorAll('input').forEach(input => {
            input.onfocus = () => input.style.borderColor = "#ddd";
            input.onblur = () => input.style.borderColor = "transparent";
            
            input.addEventListener('change', () => {
                const updatedData = {
                    key: row.querySelector('.header-key').value,
                    value: row.querySelector('.header-value').value,
                    description: row.querySelector('.header-desc').value,
                    enabled: row.querySelector('.header-enabled').checked
                };
                handlers.onUpdate(header.id, updatedData);
            });
        });

        row.querySelector('.header-delete').onclick = () => {
            handlers.onDelete(header.id);
        };

        return row;
    }

    static appendNewRow(container, header, handlers) {
        const row = this.createHeaderRow(header, handlers);
        const body = container.querySelector('#headers-body');
        if (body) {
            body.appendChild(row);
        }
        return row;
    }

    static removeHeaderRow(id) {
        const row = document.querySelector(`.header-row[data-id="${id}"]`);
        if (row) row.remove();
    }
}