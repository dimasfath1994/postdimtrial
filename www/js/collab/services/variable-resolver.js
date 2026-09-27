import { DataBridge } from '../controller/bridge.js';

/**
 * VariableResolver
 * Bertugas mencari pola {{key}} atau {{$key}} dan menggantinya.
 * Mendukung runtime, collection, environment, global, dan built-in variables.
 */
export class VariableResolver {
    
    static resolveRequest(requestData, state) {
        // Salin requestData agar tidak merusak data asli
        const resolved = { ...requestData };
        const collectionId = requestData.collection_id ?? requestData.collectionId;
        const isDraft = String(requestData.id || requestData.requestId || '').startsWith('draft_');
        const draftCollectionVariables = isDraft
            ? DataBridge.load(requestData.id || requestData.requestId, 'collectionVariables')
            : null;
        const collectionVariables = draftCollectionVariables
            ?? state.collectionVariablesById?.[String(collectionId)]
            ?? state.collections?.find(collection => String(collection.id) === String(collectionId))?.environment
            ?? state.collectionVariables
            ?? {};
        const scopedState = { ...state, collectionVariables };

        resolved.url = this.resolveString(requestData.url, scopedState);
        resolved.params = this.resolveObject(requestData.params, scopedState);
        resolved.headers = this.resolveObject(requestData.headers, scopedState);
        resolved.pre_script = this.resolveString(requestData.pre_script, scopedState);
        resolved.post_script = this.resolveString(requestData.post_script, scopedState);

        // --- PENANGANAN BODY YANG DINAMIS ---
        if (requestData.body instanceof FormData) {
            // Kita harus membongkar FormData, resolve, lalu buat baru
            const newFormData = new FormData();
            for (const [key, value] of requestData.body.entries()) {
                const resolvedKey = this.resolveString(key, scopedState);
                // Hanya resolve jika value adalah string (bukan File/Blob)
                const resolvedValue = typeof value === 'string' 
                    ? this.resolveString(value, scopedState) 
                    : value; 
                newFormData.append(resolvedKey, resolvedValue);
            }
            resolved.body = newFormData;

        } else if (requestData.body instanceof URLSearchParams) {
            // Kita harus membongkar URLSearchParams, resolve, lalu buat baru
            const newSearchParams = new URLSearchParams();
            for (const [key, value] of requestData.body.entries()) {
                newSearchParams.append(
                    this.resolveString(key, scopedState),
                    this.resolveString(value, scopedState)
                );
            }
            resolved.body = newSearchParams;

        } else if (typeof requestData.body === 'string') {
            // Raw mode (JSON/Text)
            resolved.body = this.resolveString(requestData.body, scopedState);
        } else if (requestData.body && typeof requestData.body === 'object') {
            resolved.body = this.resolveValue(requestData.body, scopedState);
        }

        return resolved;
    }

    static resolveString(str, state) {
        if (typeof str !== 'string') return str;
    
        return str.replace(/\$?\{\{\s*\$?(.+?)\s*\}\}/g, (match, key) => {
            const cleanKey = key.trim();
    
            // 1. Cek Dynamic Variables (Built-in)
            const dynamicVar = this.resolveDynamicVariable(cleanKey);
            if (dynamicVar !== null) return dynamicVar;
    
            const runtimeValue = state.runtimeVariables?.[cleanKey];
            if (runtimeValue !== undefined && runtimeValue !== null) return runtimeValue;

            const collectionValue = state.collectionVariables?.[cleanKey];
            if (collectionValue !== undefined && collectionValue !== null) return collectionValue;

            const envs = state.environments || [];
            const envVar = envs.find(v => (v.env_key || v.key) === cleanKey);
            if (envVar) return envVar.env_value ?? envVar.value;
    
            // 3. Cek Global Vars (Data ada di state.globals)
            const globals = state.globals || [];
            const globalVar = globals.find(v => (v.global_key || v.key) === cleanKey);
            if (globalVar) return globalVar.global_value ?? globalVar.value;
    
            // Jika sampai sini tidak ketemu, kembalikan apa adanya
            console.warn(`[RESOLVER] Variabel '${cleanKey}' tidak ditemukan di state!`);
            return match;
        });
    }

    static resolveObject(obj, state) {
        if (!obj) return {};
        return this.resolveValue(obj, state);
    }

    static resolveValue(value, state) {
        if (typeof value === 'string') return this.resolveString(value, state);
        if (Array.isArray(value)) return value.map((item) => this.resolveValue(item, state));
        if (!value || typeof value !== 'object' || value instanceof Blob || value instanceof File) return value;

        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [
                this.resolveString(key, state),
                this.resolveValue(item, state)
            ])
        );
    }

    /**
     * Menangani variabel sistem (Dynamic)
     */
    static resolveDynamicVariable(key) {
        switch (key.toLowerCase()) {
            case 'guid':
            case '$guid':
                return crypto.randomUUID();
            case 'timestamp':
            case '$timestamp':
                return Date.now().toString();
            case 'randomint':
            case '$randomint':
                return Math.floor(Math.random() * 1000).toString();
            default:
                return null;
        }
    }
}