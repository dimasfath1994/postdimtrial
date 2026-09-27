// js/ui/grpc-ui.js
import { enableMonacoClipboard } from '../../ui/monaco-clipboard.js';

export class GrpcUI {
    static ensureMonacoEditor() {
        const container = document.getElementById('grpcMessageEditor');
        const bodyInput = document.getElementById('grpcBody');
        if (!container) {
            return null;
        }

        if (container.__grpcEditor) {
            return container.__grpcEditor;
        }

        const tryCreateEditor = () => {
            if (!window.monaco?.editor || !container) return false;

            container.__grpcEditor = monaco.editor.create(container, {
                value: bodyInput?.value || '{\n  \n}',
                language: 'json',
                theme: 'vs-dark',
                automaticLayout: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 13,
                tabSize: 2
            });
            enableMonacoClipboard(container.__grpcEditor);

            container.__grpcEditor.onDidChangeModelContent(() => {
                const val = container.__grpcEditor.getValue();
                if (bodyInput) bodyInput.value = val;
                const syncEvent = new CustomEvent('grpc:payload-changed', { detail: { value: val } });
                window.dispatchEvent(syncEvent);
                if (!container.__postdimSettingValue) {
                    container.__postdimPayloadChange?.('payload', val);
                }
            });

            container.style.display = 'block';
            bodyInput?.classList.add('hidden');
            if (bodyInput) {
                bodyInput.style.display = 'none';
                bodyInput.oninput = null;
            }

            return true;
        };

        if (tryCreateEditor()) {
            return container.__grpcEditor;
        }

        if (window.require) {
            window.require(['vs/editor/editor.main'], () => {
                if (container.__grpcEditor) return;
                tryCreateEditor();
                if (container.__grpcEditor) {
                    requestAnimationFrame(() => container.__grpcEditor.layout());
                }
            });
        }

        return container.__grpcEditor || null;
    }

    static updateMetadataRows(metadata = []) {
        const box = document.getElementById('grpcMetadataBox');
        if (!box) return;

        box.innerHTML = '';
        const items = Array.isArray(metadata) ? metadata : [];

        items.forEach((item, index) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; align-items:center; gap:8px; padding:8px 10px; border-bottom:1px solid #2b2b2b;';

            const enabled = document.createElement('input');
            enabled.type = 'checkbox';
            enabled.className = 'grpc-meta-enabled';
            enabled.dataset.index = index;
            enabled.checked = item.enabled !== false;

            const key = document.createElement('input');
            key.type = 'text';
            key.className = 'grpc-meta-key';
            key.dataset.index = index;
            key.value = item.key || '';
            key.placeholder = 'Key';
            key.autocomplete = 'off';
            key.style.cssText = 'flex:1; min-width:0; width:auto; margin:0; background:#111; color:#fff; border:1px solid #555; border-radius:4px; padding:6px 8px; pointer-events:auto;';

            const value = document.createElement('input');
            value.type = 'text';
            value.className = 'grpc-meta-value';
            value.dataset.index = index;
            value.value = item.value || '';
            value.placeholder = 'Value';
            value.autocomplete = 'off';
            value.style.cssText = key.style.cssText;

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'grpc-meta-delete';
            remove.dataset.index = index;
            remove.textContent = '×';
            remove.style.cssText = 'background:none; border:none; color:#f88; cursor:pointer; font-size:16px;';

            row.append(enabled, key, value, remove);
            box.appendChild(row);
        });
    }

    static render(data = {}, container, callbacks = {}) {
        const root = container || document.getElementById('grpcPanelsContainer') || document.getElementById('grpcBox');
        if (!root) return;

        const editorContainer = document.getElementById('grpcMessageEditor');
        if (editorContainer) editorContainer.__postdimPayloadChange = callbacks.onFieldChange;
        const editor = this.ensureMonacoEditor();
        const addBtn = document.getElementById('addGrpcMetadata');

        const bodyInput = document.getElementById('grpcBody');
        const bodyValue = typeof data.payload === 'string' ? data.payload : (data.payload ? JSON.stringify(data.payload, null, 2) : '{}');
        if (bodyInput) bodyInput.value = bodyValue;

        if (editor) {
            if (editor.getValue() !== bodyValue) {
                editorContainer.__postdimSettingValue = true;
                editor.setValue(bodyValue);
                editorContainer.__postdimSettingValue = false;
            }
            requestAnimationFrame(() => editor.layout());
        } else if (editorContainer && bodyInput) {
            editorContainer.style.display = 'none';
            bodyInput.classList.remove('hidden');
            bodyInput.style.display = 'block';
            bodyInput.oninput = () => callbacks.onFieldChange?.('payload', bodyInput.value);
        }

        const methodSelect = document.getElementById('grpcServiceMethod');
        if (methodSelect) {
            const current = methodSelect.value;
            const serviceMethod = data.service_method || data.serviceMethod || '';
            if (serviceMethod && !Array.from(methodSelect.options).some(option => option.value === serviceMethod)) {
                const opt = document.createElement('option');
                opt.value = serviceMethod;
                opt.textContent = serviceMethod;
                methodSelect.appendChild(opt);
            }
            methodSelect.value = serviceMethod || current || '';
            methodSelect.onchange = () => {
                if (callbacks.onFieldChange) {
                    callbacks.onFieldChange('service_method', methodSelect.value);
                }
            };
        }

        const protoFileName = document.getElementById('protoFileName');
        if (protoFileName) {
            const fileName = data.protoFileName || data.proto_file_name || 'No .proto loaded';
            protoFileName.textContent = fileName;
            protoFileName.style.color = fileName === 'No .proto loaded' ? '#aaa' : '#4caf50';
        }

        const metadataRows = Array.isArray(data.metadata) ? data.metadata.map(item => ({ ...item })) : [];
        this.updateMetadataRows(metadataRows);

        if (addBtn) {
            addBtn.onclick = () => {
                const metadataBox = document.getElementById('grpcMetadataBox');
                const newItem = { id: `temp_${Date.now()}`, key: '', value: '', enabled: true };
                metadataRows.push(newItem);
                const rowIndex = metadataRows.length - 1;
                this.updateMetadataRows(metadataRows);
                if (metadataBox) metadataBox.scrollTop = metadataBox.scrollHeight;
                metadataBox?.querySelector(`.grpc-meta-key[data-index="${rowIndex}"]`)?.focus();

                Promise.resolve(callbacks.onMetadataAdd?.(newItem)).then(created => {
                    if (!created || !created.id) return;
                    metadataRows[rowIndex].id = created.id;
                    const currentItem = metadataRows[rowIndex];
                    if (currentItem.key || currentItem.value || currentItem.enabled === false) {
                        callbacks.onMetadataUpdate?.(created.id, currentItem);
                    }
                });
            };
        }

        const fetchBtn = document.getElementById('btnFetchReflection');
        if (fetchBtn) {
            fetchBtn.onclick = async () => {
                const endpoint = document.getElementById('url')?.value || '';
                if (!callbacks.onDiscover) return;

                fetchBtn.disabled = true;
                fetchBtn.textContent = 'Loading reflection...';
                try {
                    const result = await callbacks.onDiscover(endpoint);
                    const services = Array.isArray(result?.services) ? result.services : (Array.isArray(result) ? result : []);
                    const count = services.reduce((total, item) => total + (Array.isArray(item?.methods) ? item.methods.length : 0), 0);
                    fetchBtn.textContent = count ? `Loaded (${count} methods)` : 'No methods found';
                } catch (error) {
                    fetchBtn.textContent = 'Reflection failed';
                    console.error('[gRPC Reflection UI]', error);
                } finally {
                    fetchBtn.disabled = false;
                }
            };
        }

        const chooseProtoBtn = document.getElementById('chooseProtoBtn');
        const protoInput = document.getElementById('grpcProtoFile');
        if (chooseProtoBtn) {
            chooseProtoBtn.onclick = () => protoInput?.click();
        }
        if (protoInput) {
            protoInput.onchange = async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const content = await file.text();
                if (callbacks.onLoadProto) callbacks.onLoadProto(content, file.name);
            };
        }

        const metadataBox = document.getElementById('grpcMetadataBox');
        if (metadataBox) {
            metadataBox.onchange = (event) => {
                const input = event.target.closest('.grpc-meta-key, .grpc-meta-value, .grpc-meta-enabled');
                if (!input) return;

                const index = Number(input.dataset.index);
                const row = metadataRows[index];
                if (!row) return;

                row.key = metadataBox.querySelector(`.grpc-meta-key[data-index="${index}"]`)?.value || '';
                row.value = metadataBox.querySelector(`.grpc-meta-value[data-index="${index}"]`)?.value || '';
                row.enabled = metadataBox.querySelector(`.grpc-meta-enabled[data-index="${index}"]`)?.checked ?? true;

                if (row.id && !String(row.id).startsWith('temp_')) {
                    callbacks.onMetadataUpdate?.(row.id, row);
                }
            };

            metadataBox.onclick = (event) => {
                const delBtn = event.target.closest('.grpc-meta-delete');
                if (!delBtn) return;
                const index = Number(delBtn.dataset.index);
                const [removed] = metadataRows.splice(index, 1);
                if (removed?.id) callbacks.onMetadataDelete?.(removed.id);
                this.updateMetadataRows(metadataRows);
            };
        }

    }

    static renderDiscoveredServices(res) {
        const methodSelect = document.getElementById('grpcServiceMethod');
        if (!methodSelect) return 0;

        methodSelect.innerHTML = '<option value="">-- Choose Service / Method --</option>';
        const services = Array.isArray(res?.services) ? res.services : (Array.isArray(res) ? res : []);
        let total = 0;

        services.forEach((item) => {
            if (item && item.service && Array.isArray(item.methods)) {
                const group = document.createElement('optgroup');
                group.label = item.service;
                item.methods.forEach((method) => {
                    const full = method.includes('/') ? method : `${item.service}/${method}`;
                    const option = document.createElement('option');
                    option.value = full;
                    option.textContent = method.includes('/') ? method.split('/').pop() : method;
                    group.appendChild(option);
                    total++;
                });
                methodSelect.appendChild(group);
            }
        });

        if (total === 0 && Array.isArray(res)) {
            res.forEach((item) => {
                const option = document.createElement('option');
                option.value = typeof item === 'string' ? item : JSON.stringify(item);
                option.textContent = typeof item === 'string' ? item : JSON.stringify(item);
                methodSelect.appendChild(option);
            });
            total = res.length;
        }

        return total;
    }

    static renderLocalProtoServices(res) {
        this.renderDiscoveredServices(res);
    }

    static renderReqTabs(container) {
        if (!container) {
            console.error('GrpcUI: Tabs container element is missing!');
            return;
        }
        container.innerHTML = `
            <button type="button" class="tab-btn active" data-grpc-tab="message">Message</button>
            <button type="button" class="tab-btn" data-grpc-tab="metadata">Metadata</button>
            <button type="button" class="tab-btn" data-grpc-tab="proto">Proto File</button>
            <button type="button" class="tab-btn" data-grpc-tab="scripts" data-shared-panel="scripts">Scripts</button>
        `;
    }

    static renderPanels(container) {
        if (!container) {
            console.error('GrpcUI: Panels container element is missing!');
            return;
        }
        container.innerHTML = `
            <div class="grpc-tab-panel" data-grpc-panel="message" style="display: block; height: 100%;">
                <div style="display: flex; flex-direction: column; height: 100%;">
                    <div style="margin-bottom: 6px;">
                        <span style="font-size: 12px; font-weight: bold; color: #888;">gRPC Request Payload (JSON)</span>
                    </div>
                    <div id="grpcMessageEditor" style="flex: 1; border: 1px solid #333; border-radius: 4px; min-height: 220px; overflow: hidden;"></div>
                    <textarea id="grpcBody" class="hidden" style="width: 100%; height: 200px; font-family: monospace; padding: 8px; border: 1px solid #333; border-radius: 4px; background: #1e1e1e; color: #fff;"></textarea>
                </div>
            </div>

            <div class="grpc-tab-panel" data-grpc-panel="metadata" style="display: none; height: 100%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-size: 12px; font-weight: bold; color: #888;">gRPC Metadata / Headers</span>
                    <button type="button" id="addGrpcMetadata" style="background: none; border: none; color: #007bff; cursor: pointer; font-size: 12px;">+ Add Metadata</button>
                </div>
                <div style="border: 1px solid #333; border-radius: 4px; overflow: hidden; background: #1e1e1e;">
                    <div style="display: flex; background: #252525; padding: 6px 10px; font-size: 11px; font-weight: bold; color: #888; border-bottom: 1px solid #333;">
                        <div style="width: 30px; text-align: center;"></div>
                        <div style="flex: 1; padding: 0 5px;">Key</div>
                        <div style="flex: 1; padding: 0 5px;">Value</div>
                        <div style="width: 30px; text-align: center;"></div>
                    </div>
                    <div id="grpcMetadataBox" style="max-height: 250px; overflow-y: auto;"></div>
                </div>
            </div>

            <div class="grpc-tab-panel" data-grpc-panel="proto" style="display: none; height: 100%;">
                <div style="padding: 16px; background: #1e1e1e; border: 1px solid #333; border-radius: 4px; display: flex; flex-direction: column; gap: 12px;">
                    <span style="font-size: 13px; font-weight: bold; color: #ddd;">Load Protocol Buffer (.proto)</span>
                    <p style="font-size: 12px; color: #888; margin: 0; line-height: 1.4;">Upload a local .proto file to discover services and methods if server reflection is disabled or unavailable on the target gRPC endpoint.</p>
                    <div style="display: flex; align-items: center; gap: 10px; margin-top: 4px;">
                        <input type="file" id="grpcProtoFile" accept=".proto" style="display: none;" />
                        <button type="button" id="chooseProtoBtn" style="background: #2b2b2b; color: #fff; border: 1px solid #444; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">Choose .proto File</button>
                        <span id="protoFileName" style="font-size: 12px; color: #aaa;">No .proto loaded</span>
                    </div>
                </div>
            </div>
        `;
    }

    static renderServiceSelector(container) {
        if (!container) {
            console.error('GrpcUI: Service selector container element is missing!');
            return;
        }
        container.innerHTML = `
            <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 10px;">
                <select id="grpcServiceMethod" style="flex: 1; padding: 6px 8px; background: #2b2b2b; color: #fff; border: 1px solid #444; border-radius: 4px; font-size: 13px; outline: none;">
                    <option value="">-- Pilih Service / Method --</option>
                </select>
                <button type="button" id="btnFetchReflection" style="background: #007bff; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; white-space: nowrap;">Fetch Reflection</button>
            </div>
        `;
    }
}