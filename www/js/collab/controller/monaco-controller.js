export class MonacoController {
    constructor(onScriptChange, tabCtrl) {
        this.preEditor = null;
        this.postEditor = null;
        this.onScriptChange = onScriptChange; // Callback ke requestCtrl.updateRequestFull
        this.tabCtrl = tabCtrl; // Referensi ke TabController untuk cek isApplyingData
    }

    init() {
        const amdRequire = window.require;
        if (typeof amdRequire !== "function") {
            console.error("[Monaco] AMD loader tidak tersedia di collaboration Webview.");
            return;
        }

        amdRequire.config({
            paths: {
                vs: window.__POSTDIM_MONACO_BASE__ || "./lib/js/monaco-editor/min/vs"
            }
        });
        
        amdRequire(["vs/editor/editor.main"], () => {
            this.preEditor = monaco.editor.create(document.getElementById("preEditor"), {
                value: "",
                language: "javascript",
                theme: "vs-dark",
                readOnly: false,
                domReadOnly: false,
                automaticLayout: true,
                quickSuggestions: { other: true, comments: false, strings: true },
                suggestOnTriggerCharacters: true,
                wordBasedSuggestions: "allDocuments",
                suggest: { showWords: true, showMethods: true, showFunctions: true, showVariables: true },
                minimap: { enabled: false }
            });

            this.postEditor = monaco.editor.create(document.getElementById("postEditor"), {
                value: "",
                language: "javascript",
                theme: "vs-dark",
                readOnly: false,
                domReadOnly: false,
                automaticLayout: true,
                quickSuggestions: { other: true, comments: false, strings: true },
                suggestOnTriggerCharacters: true,
                wordBasedSuggestions: "allDocuments",
                suggest: { showWords: true, showMethods: true, showFunctions: true, showVariables: true },
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
            triggerCharacters: [".", "$", "{", "(", "_"],
            provideCompletionItems: () => {
                // Pastikan Environment dan Globals bisa diakses di scope ini
                const envKeys = Object.keys(window.Environment?.getAll?.() || {});
                const globalsKeys = Object.keys(window.Globals?.getAll?.() || {});
                const variables = [...new Set([...envKeys, ...globalsKeys])];

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

                const variableSuggestions = variables.map((key) => ({
                    label: `{{${key}}}`,
                    kind: monaco.languages.CompletionItemKind.Variable,
                    insertText: `{{${key}}}`,
                    detail: "Postdim variable"
                }));

                const apiSuggestions = [
                    ["pm.variables.get", "pm.variables.get('${1:key}')"],
                    ["pm.variables.set", "pm.variables.set('${1:key}', ${2:value})"],
                    ["pm.variables.unset", "pm.variables.unset('${1:key}')"],
                    ["pm.collectionVariables.get", "pm.collectionVariables.get('${1:key}')"],
                    ["pm.collectionVariables.set", "pm.collectionVariables.set('${1:key}', ${2:value})"],
                    ["pm.request.url", "pm.request.url"],
                    ["pm.request.method", "pm.request.method"],
                    ["pm.request.headers", "pm.request.headers"],
                    ["pm.response.text", "pm.response.text()"],
                    ["pm.response.code", "pm.response.code"],
                    ["pm.test", "pm.test('${1:name}', () => {\n\t${2:}\n});"],
                    ["pm.expect", "pm.expect(${1:value})"],
                    ["pm.sendRequest", "pm.sendRequest(${1:request}, ${2:callback})"],
                    ["console.log", "console.log(${1:value})"],
                    ["console.error", "console.error(${1:error})"]
                ].map(([label, insertText]) => ({
                    label,
                    kind: monaco.languages.CompletionItemKind.Function,
                    insertText,
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    detail: "Postdim API"
                }));

                const javascriptSuggestions = [
                    ["matchMedia", "matchMedia(${1:query})"], ["fetch", "fetch(${1:url})"],
                    ["XMLHttpRequest", "XMLHttpRequest"], ["WebSocket", "WebSocket"],
                    ["URL", "URL"], ["URLSearchParams", "URLSearchParams"], ["FormData", "FormData"],
                    ["Headers", "Headers"], ["Request", "Request"], ["Response", "Response"],
                    ["Blob", "Blob"], ["File", "File"], ["FileReader", "FileReader"],
                    ["JSON", "JSON"], ["Object", "Object"], ["Array", "Array"], ["String", "String"],
                    ["Number", "Number"], ["BigInt", "BigInt"], ["Boolean", "Boolean"],
                    ["Date", "Date"], ["RegExp", "RegExp"], ["Error", "Error"],
                    ["Map", "Map"], ["Set", "Set"], ["WeakMap", "WeakMap"], ["WeakSet", "WeakSet"],
                    ["Promise", "Promise"], ["Symbol", "Symbol"], ["Proxy", "Proxy"], ["Reflect", "Reflect"],
                    ["Math", "Math"], ["Intl", "Intl"], ["console", "console"],
                    ["setTimeout", "setTimeout(${1:callback}, ${2:delay})"],
                    ["setInterval", "setInterval(${1:callback}, ${2:delay})"],
                    ["clearTimeout", "clearTimeout(${1:id})"], ["clearInterval", "clearInterval(${1:id})"],
                    ["queueMicrotask", "queueMicrotask(${1:callback})"], ["structuredClone", "structuredClone(${1:value})"],
                    ["JSON.stringify", "JSON.stringify(${1:value}, null, 2)"], ["JSON.parse", "JSON.parse(${1:value})"],
                    ["Object.keys", "Object.keys(${1:value})"], ["Object.values", "Object.values(${1:value})"],
                    ["Object.entries", "Object.entries(${1:value})"], ["Object.fromEntries", "Object.fromEntries(${1:entries})"],
                    ["Array.isArray", "Array.isArray(${1:value})"], ["Array.from", "Array.from(${1:iterable})"],
                    ["Math.max", "Math.max(${1:value})"], ["Math.min", "Math.min(${1:value})"],
                    ["Math.round", "Math.round(${1:value})"], ["Math.floor", "Math.floor(${1:value})"],
                    ["Math.ceil", "Math.ceil(${1:value})"], ["Math.random", "Math.random()"],
                    ["Date.now", "Date.now()"], ["crypto.randomUUID", "crypto.randomUUID()"],
                    ["Promise.all", "Promise.all(${1:promises})"], ["Promise.allSettled", "Promise.allSettled(${1:promises})"],
                    ["Promise.race", "Promise.race(${1:promises})"], ["Promise.resolve", "Promise.resolve(${1:value})"],
                    ["parseInt", "parseInt(${1:value}, 10)"], ["parseFloat", "parseFloat(${1:value})"],
                    ["encodeURIComponent", "encodeURIComponent(${1:value})"], ["decodeURIComponent", "decodeURIComponent(${1:value})"],
                    ["btoa", "btoa(${1:value})"], ["atob", "atob(${1:value})"],
                    ["console.log", "console.log(${1:value})"], ["console.warn", "console.warn(${1:value})"],
                    ["console.error", "console.error(${1:error})"], ["console.table", "console.table(${1:value})"],
                    ["const", "const ${1:name} = ${2:value}"], ["let", "let ${1:name} = ${2:value}"],
                    ["var", "var ${1:name} = ${2:value}"], ["function", "function ${1:name}(${2:args}) {\n\t${3:}\n}"],
                    ["if", "if (${1:condition}) {\n\t${2:}\n}"], ["else", "else {\n\t${1:}\n}"],
                    ["for", "for (const ${1:item} of ${2:items}) {\n\t${3:}\n}"],
                    ["forEach", "${1:items}.forEach((${2:item}) => {\n\t${3:}\n});"],
                    ["map", "${1:items}.map((${2:item}) => ${3:item});"],
                    ["filter", "${1:items}.filter((${2:item}) => ${3:condition});"],
                    ["find", "${1:items}.find((${2:item}) => ${3:condition});"],
                    ["reduce", "${1:items}.reduce((${2:total}, ${3:item}) => ${4:total}, ${5:initial});"],
                    ["try", "try {\n\t${1:}\n} catch (error) {\n\t${2:}\n}"],
                    ["async", "async"], ["await", "await ${1:expression}"], ["return", "return ${1:value}"],
                    ["throw", "throw new Error(${1:message})"]
                ].map(([label, insertText]) => ({
                    label,
                    kind: monaco.languages.CompletionItemKind.Function,
                    insertText,
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    detail: "JavaScript"
                }));

                const methodSuggestions = [
                    ["toString", "toString()"], ["valueOf", "valueOf()"], ["toUpperCase", "toUpperCase()"],
                    ["toLowerCase", "toLowerCase()"], ["trim", "trim()"], ["trimStart", "trimStart()"],
                    ["trimEnd", "trimEnd()"], ["includes", "includes(${1:value})"], ["startsWith", "startsWith(${1:value})"],
                    ["endsWith", "endsWith(${1:value})"], ["indexOf", "indexOf(${1:value})"], ["lastIndexOf", "lastIndexOf(${1:value})"],
                    ["substring", "substring(${1:start}, ${2:end})"], ["slice", "slice(${1:start}, ${2:end})"],
                    ["split", "split(${1:separator})"], ["replace", "replace(${1:search}, ${2:replacement})"],
                    ["replaceAll", "replaceAll(${1:search}, ${2:replacement})"], ["match", "match(${1:pattern})"],
                    ["push", "push(${1:value})"], ["pop", "pop()"], ["shift", "shift()"], ["unshift", "unshift(${1:value})"],
                    ["join", "join(${1:separator})"], ["sort", "sort(${1:compareFn})"], ["reverse", "reverse()"],
                    ["map", "map((${1:item}) => ${2:item})"], ["filter", "filter((${1:item}) => ${2:true})"],
                    ["find", "find((${1:item}) => ${2:true})"], ["findIndex", "findIndex((${1:item}) => ${2:true})"],
                    ["some", "some((${1:item}) => ${2:true})"], ["every", "every((${1:item}) => ${2:true})"],
                    ["reduce", "reduce((${1:total}, ${2:item}) => ${3:total}, ${4:initial})"],
                    ["forEach", "forEach((${1:item}) => {\n\t${2:}\n})"], ["flat", "flat(${1:depth})"],
                    ["flatMap", "flatMap((${1:item}) => ${2:item})"], ["keys", "keys()"], ["values", "values()"],
                    ["entries", "entries()"], ["hasOwnProperty", "hasOwnProperty('${1:key}')"],
                    ["toFixed", "toFixed(${1:digits})"], ["toLocaleString", "toLocaleString()"],
                    ["then", "then((${1:value}) => ${2:value})"], ["catch", "catch((error) => {\n\t${1:}\n})"],
                    ["finally", "finally(() => {\n\t${1:}\n})"]
                ].map(([label, insertText]) => ({
                    label,
                    kind: monaco.languages.CompletionItemKind.Method,
                    insertText,
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    detail: "JavaScript method"
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
                        ...globalSuggestions,
                        ...variableSuggestions
                    ]
                };
            }
        });
    }

}