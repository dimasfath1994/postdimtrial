// js/ui/graphql-ui.js

export class GraphqlUI {
    static queryEditor = null;
    static variablesEditor = null;
    static isUpdatingFromState = false;
    static callbacks = {};

    /**
     * Render UI Layout & Inisialisasi Textarea (Default) & Monaco Editor
     */
    static render(data = {}, container, callbacks = {}) {
        if (!container) {
            console.error("GraphqlUI: Container element missing!");
            return;
        }

        this.callbacks = callbacks || {};

        // Render struktur HTML dengan Textarea AKTIF & VISIBEL secara default
        container.innerHTML = `
            <div style="display: flex; gap: 12px; width: 100%; height: 100%; min-height: 240px; box-sizing: border-box;">
                <!-- Query Editor Section -->
                <div style="display: flex; flex-direction: column; flex: 1; height: 100%;">
                    <div style="margin-bottom: 6px;">
                        <span style="font-size: 12px; font-weight: bold; color: #aaa;">GraphQL Query / Mutation</span>
                    </div>
                    <!-- Monaco Container (Hidden sampai Monaco siap & visible) -->
                    <div id="graphqlQueryEditor" style="display: none; flex: 1; min-height: 200px; border: 1px solid #333; border-radius: 4px; overflow: hidden; background: #1e1e1e;"></div>
                    <!-- Native Textarea (Default Visible agar selalu bisa diketik) -->
                    <textarea id="graphqlQuery" class="graphql-query-input" 
                        placeholder="query { ... }"
                        style="flex: 1; min-height: 200px; width: 100%; background: #1e1e1e; color: #d4d4d4; border: 1px solid #333; border-radius: 4px; padding: 10px; font-family: 'Fira Code', Consolas, Monaco, monospace; font-size: 13px; line-height: 1.5; resize: none; outline: none; box-sizing: border-box;"
                    >${data.query || ''}</textarea>
                </div>

                <!-- Variables Editor Section -->
                <div style="display: flex; flex-direction: column; flex: 1; height: 100%;">
                    <div style="margin-bottom: 6px;">
                        <span style="font-size: 12px; font-weight: bold; color: #aaa;">GraphQL Variables (JSON)</span>
                    </div>
                    <!-- Monaco Container -->
                    <div id="graphqlVariablesEditor" style="display: none; flex: 1; min-height: 200px; border: 1px solid #333; border-radius: 4px; overflow: hidden; background: #1e1e1e;"></div>
                    <!-- Native Textarea (Default Visible agar selalu bisa diketik) -->
                    <textarea id="graphqlVariables" class="graphql-variables-input" 
                        placeholder="{}"
                        style="flex: 1; min-height: 200px; width: 100%; background: #1e1e1e; color: #d4d4d4; border: 1px solid #333; border-radius: 4px; padding: 10px; font-family: 'Fira Code', Consolas, Monaco, monospace; font-size: 13px; line-height: 1.5; resize: none; outline: none; box-sizing: border-box;"
                    >${typeof data.variables === 'string' ? data.variables : JSON.stringify(data.variables || {}, null, 2)}</textarea>
                </div>
            </div>
        `;

        // Pasang event listener langsung pada textarea biasa
        this.bindNativeTextareas();

        // Coba upgrade ke Monaco jika siap & visible
        this.initMonaco(data);
    }

    /**
     * Bind input listener pada native textarea
     */
    static bindNativeTextareas() {
        const queryTextarea = document.getElementById('graphqlQuery');
        const varsTextarea = document.getElementById('graphqlVariables');

        if (queryTextarea) {
            queryTextarea.oninput = () => {
                if (this.isUpdatingFromState) return;
                const val = queryTextarea.value;
                if (this.queryEditor && this.queryEditor.getValue() !== val) {
                    this.queryEditor.setValue(val);
                }
                if (this.callbacks.onQueryChange) this.callbacks.onQueryChange(val);
            };
        }

        if (varsTextarea) {
            varsTextarea.oninput = () => {
                if (this.isUpdatingFromState) return;
                const val = varsTextarea.value;
                if (this.variablesEditor && this.variablesEditor.getValue() !== val) {
                    this.variablesEditor.setValue(val);
                }
                if (this.callbacks.onVariablesChange) this.callbacks.onVariablesChange(val);
            };
        }
    }

    /**
     * Inisialisasi Monaco Editor (Hanya jika container visible)
     */
    static initMonaco(data = {}) {
        const queryContainer = document.getElementById('graphqlQueryEditor');
        const varsContainer = document.getElementById('graphqlVariablesEditor');
        const queryTextarea = document.getElementById('graphqlQuery');
        const varsTextarea = document.getElementById('graphqlVariables');

        if (!queryContainer || !varsContainer || !window.monaco) return;

        // Cek apakah elemen sedang visible di layar (width & height > 0)
        const parentBox = queryContainer.parentElement;
        if (!parentBox || parentBox.offsetWidth === 0 || parentBox.offsetHeight === 0) {
            // Jika masih tersembunyi (tab lain aktif), tunda ke layout() saat tab dibuka
            return;
        }

        try {
            const theme = 'vs-dark';

            // 1. Monaco Query Editor
            if (!this.queryEditor) {
                this.queryEditor = monaco.editor.create(queryContainer, {
                    value: queryTextarea ? queryTextarea.value : (data.query || ''),
                    language: 'graphql',
                    theme: theme,
                    automaticLayout: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    tabSize: 2
                });

                this.queryEditor.onDidChangeModelContent(() => {
                    if (this.isUpdatingFromState) return;
                    const val = this.queryEditor.getValue();
                    if (queryTextarea) queryTextarea.value = val;
                    if (this.callbacks.onQueryChange) this.callbacks.onQueryChange(val);
                });
            }

            // 2. Monaco Variables Editor
            if (!this.variablesEditor) {
                const initialVars = varsTextarea ? varsTextarea.value : (typeof data.variables === 'string'
                    ? data.variables
                    : JSON.stringify(data.variables || {}, null, 2));

                this.variablesEditor = monaco.editor.create(varsContainer, {
                    value: initialVars,
                    language: 'json',
                    theme: theme,
                    automaticLayout: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    tabSize: 2
                });

                this.variablesEditor.onDidChangeModelContent(() => {
                    if (this.isUpdatingFromState) return;
                    const val = this.variablesEditor.getValue();
                    if (varsTextarea) varsTextarea.value = val;
                    if (this.callbacks.onVariablesChange) this.callbacks.onVariablesChange(val);
                });
            }

            // Sembunyikan textarea biasa, tampilkan Monaco container
            if (queryTextarea) queryTextarea.style.display = 'none';
            if (varsTextarea) varsTextarea.style.display = 'none';
            queryContainer.style.display = 'block';
            varsContainer.style.display = 'block';

            this.layout();
        } catch (e) {
            console.warn("GraphqlUI: Monaco failed to mount, keeping native textareas active.", e);
        }
    }

    /**
     * Update nilai field dari State luar
     */
    static updateFields(data = {}) {
        this.isUpdatingFromState = true;
        try {
            const queryTextarea = document.getElementById('graphqlQuery');
            const varsTextarea = document.getElementById('graphqlVariables');

            const queryVal = data.query !== undefined ? data.query : '';
            const varsVal = data.variables !== undefined 
                ? (typeof data.variables === 'string' ? data.variables : JSON.stringify(data.variables, null, 2))
                : '{}';

            if (queryTextarea) queryTextarea.value = queryVal;
            if (varsTextarea) varsTextarea.value = varsVal;

            if (this.queryEditor && this.queryEditor.getValue() !== queryVal) {
                this.queryEditor.setValue(queryVal);
            }
            if (this.variablesEditor && this.variablesEditor.getValue() !== varsVal) {
                this.variablesEditor.setValue(varsVal);
            }
        } finally {
            this.isUpdatingFromState = false;
        }
    }

    /**
     * Dipanggil saat Tab GraphQL diaktifkan (memastikan Monaco di-mount / di-layout)
     */
    static layout() {
        setTimeout(() => {
            // Coba mount Monaco jika belum sempat dibuat saat container tersembunyi
            if (!this.queryEditor || !this.variablesEditor) {
                this.initMonaco();
            }

            if (this.queryEditor) {
                this.queryEditor.layout();
            }
            if (this.variablesEditor) {
                this.variablesEditor.layout();
            }
        }, 50);
    }
}