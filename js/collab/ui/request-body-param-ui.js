// js/ui/request-body-param-ui.js

export class RequestBodyParamUI {
    /**
     * @param {Array} params - List parameter
     * @param {HTMLElement} container - Container target
     * @param {Object} handlers - Event handlers
     * @param {string} mode - 'formdata' atau 'urlencoded'
     */
    static renderParams(params, container, handlers, mode) {
        const title = mode === 'formdata' ? 'Form Data' : 'URL Encoded';
        
        container.innerHTML = `
            <div style="margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 13px; font-weight: bold; color: #666;">${title} Parameters</span>
                <div style="display: flex; gap: 5px;">
                    <button id="add-text-btn" style="background: none; border: 1px solid #ddd; padding: 2px 8px; cursor: pointer; font-size: 11px;">+ Text</button>
                    ${mode === 'formdata' ? '<button id="add-file-btn" style="background: none; border: 1px solid #ddd; padding: 2px 8px; cursor: pointer; font-size: 11px;">+ File</button>' : ''}
                </div>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                    <tr style="border-bottom: 1px solid #ddd; text-align: left; color: #666;">
                        <th style="padding: 8px 4px; width: 30px;"></th>
                        <th style="padding: 8px 4px; width: 20%;">Key</th>
                        <th style="padding: 8px 4px; width: 40%;">Value</th>
                        <th style="padding: 8px 4px;">Description</th>
                        <th style="padding: 8px 4px; width: 40px;"></th>
                    </tr>
                </thead>
                <tbody id="params-body"></tbody>
            </table>
        `;

        const body = container.querySelector('#params-body');
        if (params && params.length > 0) {
            params.forEach(param => body.appendChild(this.createParamRow(param, handlers)));
        }

        container.querySelector('#add-text-btn').onclick = () => handlers.onAdd('text', mode);
        const addFileBtn = container.querySelector('#add-file-btn');
        if (addFileBtn) {
            addFileBtn.onclick = () => handlers.onAdd('file', mode);
        }
    }

    static createParamRow(param, handlers) {
        const row = document.createElement('tr');
        row.className = 'param-row';
        row.dataset.id = param.id;

        const inputStyle = "width: 100%; border: 1px solid transparent; padding: 6px; background: transparent; font-size: 13px;";
        const isFile = param.type === 'file';
        
        const valueField = isFile 
            ? `<div class="file-input-wrapper" style="padding: 6px;">
                 <span style="font-size: 11px; color: #888;">${param.file_name || 'No file'}</span>
                 <input type="file" class="param-file-upload" style="display:none">
                 <button type="button" class="btn-select-file" style="font-size:10px; cursor:pointer;">Select</button>
               </div>`
            : `<input type="text" value="${param.value || ''}" placeholder="Value" class="param-value" style="${inputStyle}">`;

        row.innerHTML = `
            <td style="text-align: center;"><input type="checkbox" ${param.enabled ? 'checked' : ''} class="param-enabled"></td>
            <td><input type="text" value="${param.key || ''}" placeholder="Key" class="param-key" style="${inputStyle}"></td>
            <td>${valueField}</td>
            <td><input type="text" value="${param.description || ''}" placeholder="Description" class="param-desc" style="${inputStyle}"></td>
            <td style="text-align: center;">
                <button class="param-delete" style="border:none; background:none; cursor:pointer; color:#ccc; font-size: 16px;">×</button>
            </td>
        `;

        // Fungsi untuk trigger update
        const triggerUpdate = () => {
            handlers.onUpdate(param.id, {
                key: row.querySelector('.param-key').value,
                value: row.querySelector('.param-value')?.value || param.value,
                description: row.querySelector('.param-desc').value,
                enabled: row.querySelector('.param-enabled').checked,
                type: param.type,
                mode: param.mode
            });
        };

        // Menambahkan listener 'blur' agar data tersimpan saat user pindah klik
        row.querySelectorAll('input:not(.param-file-upload)').forEach(input => {
            input.addEventListener('change', triggerUpdate);
            input.addEventListener('blur', triggerUpdate); 
        });

        if (isFile) {
            const fileInput = row.querySelector('.param-file-upload');
            row.querySelector('.btn-select-file').onclick = () => fileInput.click();
            fileInput.onchange = (e) => {
                if (e.target.files[0]) handlers.onUpload(e.target.files[0], param.id);
            };
        }

        row.querySelector('.param-delete').onclick = () => {
            handlers.onDelete(param.id, isFile ? param.value : null);
        };

        return row;
    }

    static removeParamRow(id) {
        const row = document.querySelector(`.param-row[data-id="${id}"]`);
        if (row) row.remove();
    }
}