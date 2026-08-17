// js/ui/graphql-ui.js

export class GraphqlUI {
    static queryEditor = null;
    static variablesEditor = null;
    static isUpdatingFromState = false;
    static callbacks = {};

    static disposeEditors() {
        if (this.queryEditor) {
            try { this.queryEditor.dispose(); } catch (e) {}
            this.queryEditor = null;
        }
        if (this.variablesEditor) {
            try { this.variablesEditor.dispose(); } catch (e) {}
            this.variablesEditor = null;
        }
    }

    static render(data = {}, container, callbacks = {}) {
        if (!container) {
            console.error("GraphqlUI: Container element missing!");
            return;
        }

        this.callbacks = callbacks || {};
        this.disposeEditors();

        container.innerHTML = `
            <div style="display: flex; gap: 12px; width: 100%; height: 100%; min-height: 240px; box-sizing: border-box;">
                <!-- Query Editor Section -->
                <div style="display: flex; flex-direction: column; flex: 1; height: 100%;">
                    <div style="margin-bottom: 6px;">
                        <span style="font-size: 12px; font-weight: bold; color: #aaa;">GraphQL Query / Mutation</span>
                    </div>
                    <div id="graphqlQueryEditor" style="display: none; flex: 1; min-height: 200px; border: 1px solid #333; border-radius: 4px; overflow: hidden; background: #1e1e1e;"></div>
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
                    <div id="graphqlVariablesEditor" style="display: none; flex: 1; min-height: 200px; border: 1px solid #333; border-radius: 4px; overflow: hidden; background: #1e1e1e;"></div>
                    <textarea id="graphqlVariables" class="graphql-variables-input" 
                        placeholder="{}"
                        style="flex: 1; min-height: 200px; width: 100%; background: #1e1e1e; color: #d4d4d4; border: 1px solid #333; border-radius: 4px; padding: 10px; font-family: 'Fira Code', Consolas, Monaco, monospace; font-size: 13px; line-height: 1.5; resize: none; outline: none; box-sizing: border-box;"
                    >${typeof data.variables === 'string' ? data.variables : JSON.stringify(data.variables || {}, null, 2)}</textarea>
                </div>
            </div>
        `;

        this.bindNativeTextareas();
        this.initMonaco(data);
    }

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

    static initMonaco(data = {}) {
        const queryContainer = document.getElementById('graphqlQueryEditor');
        const varsContainer = document.getElementById('graphqlVariablesEditor');
        const queryTextarea = document.getElementById('graphqlQuery');
        const varsTextarea = document.getElementById('graphqlVariables');

        if (!queryContainer || !varsContainer || !window.monaco) return;

        try {
            const theme = 'vs-dark';

            // 1. Query Editor
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
            } else if (data.query !== undefined) {
                this.queryEditor.setValue(data.query);
            }

            // 2. Variables Editor
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
            } else if (data.variables !== undefined) {
                const varsStr = typeof data.variables === 'string'
                    ? data.variables
                    : JSON.stringify(data.variables, null, 2);
                this.variablesEditor.setValue(varsStr);
            }

            // Switch tampilan ke Monaco Container
            if (queryTextarea) queryTextarea.style.display = 'none';
            if (varsTextarea) varsTextarea.style.display = 'none';
            queryContainer.style.display = 'block';
            varsContainer.style.display = 'block';

            this.layout();
        } catch (e) {
            console.warn("GraphqlUI: Monaco mount error, keeping native textarea active.", e);
        }
    }

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

    static layout() {
        setTimeout(() => {
            if (!this.queryEditor || !this.variablesEditor) {
                this.initMonaco();
            }

            if (this.queryEditor) this.queryEditor.layout();
            if (this.variablesEditor) this.variablesEditor.layout();
        }, 50);
    }
}