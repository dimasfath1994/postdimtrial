export class MonacoController {
    constructor(onScriptChange, tabCtrl) {
        this.preEditor = null;
        this.postEditor = null;
        this.onScriptChange = onScriptChange; // Callback ke requestCtrl.updateRequestFull
        this.tabCtrl = tabCtrl; // Referensi ke TabController untuk cek isApplyingData
    }

    init() {
        // Pastikan path ini benar relatif terhadap lokasi file HTML Anda
        require.config({ paths: { vs: "./lib/js/monaco-editor/min/vs" } });
        
        require(["vs/editor/editor.main"], () => {
            this.preEditor = monaco.editor.create(document.getElementById("preEditor"), {
                value: "",
                language: "javascript",
                theme: "vs-dark",
                automaticLayout: true,
                minimap: { enabled: false }
            });

            this.postEditor = monaco.editor.create(document.getElementById("postEditor"), {
                value: "",
                language: "javascript",
                theme: "vs-dark",
                automaticLayout: true,
                minimap: { enabled: false }
            });

            this.setupIntellisense();
            this.bindEvents();
        });
    }

    bindEvents() {
        const blurHandler = () => {
            // Jika kita sedang loading data ke editor, jangan di-save
            if (this.tabCtrl && this.tabCtrl.isApplyingData) return;
            
            // Panggil callback untuk save ke DB
            this.onScriptChange();
        };

        // Event blur khusus untuk Monaco
        this.preEditor.onDidBlurEditorText(blurHandler);
        this.postEditor.onDidBlurEditorText(blurHandler);
    }

    setValues(pre, post) {
        if (this.preEditor) this.preEditor.setValue(pre || "");
        if (this.postEditor) this.postEditor.setValue(post || "");
    }

    getValues() {
        return {
            pre_script: this.preEditor?.getValue() || "",
            post_script: this.postEditor?.getValue() || ""
        };
    }

    setupIntellisense() {
        monaco.languages.registerCompletionItemProvider("javascript", {
            provideCompletionItems: () => {
                // Pastikan Environment dan Globals bisa diakses di scope ini
                const envKeys = Object.keys(window.Environment?.getAll?.() || {});
                const globalsKeys = Object.keys(window.Globals?.getAll?.() || {});

                const envSuggestions = envKeys.map(k => ({
                    label: `env.${k}`,
                    kind: monaco.languages.CompletionItemKind.Variable,
                    insertText: `pm.environment.get("${k}")`
                }));

                const globalSuggestions = globalsKeys.map(k => ({
                    label: `global.${k}`,
                    kind: monaco.languages.CompletionItemKind.Variable,
                    insertText: `pm.globals.get("${k}")`
                }));

                return {
                    suggestions: [
                        {
                            label: "pm.environment.get",
                            kind: monaco.languages.CompletionItemKind.Function,
                            insertText: "pm.environment.get('${1:key}')",
                            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                        },
                        {
                            label: "pm.environment.set",
                            kind: monaco.languages.CompletionItemKind.Function,
                            insertText: "pm.environment.set('${1:key}', ${2:value})",
                            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                        },
                        {
                            label: "pm.response.json",
                            kind: monaco.languages.CompletionItemKind.Function,
                            insertText: "pm.response.json()"
                        },
                        ...envSuggestions,
                        ...globalSuggestions
                    ]
                };
            }
        });
    }
}