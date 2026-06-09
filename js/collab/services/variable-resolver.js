/**
 * VariableResolver
 * Bertugas mencari pola {{key}} atau {{$key}} dan menggantinya.
 * Mendukung Prioritas: Env > Global > Built-in Dynamic Variables.
 */
export class VariableResolver {
    
    static resolveRequest(requestData, state) {
        // Salin requestData agar tidak merusak data asli
        const resolved = { ...requestData };

        resolved.url = this.resolveString(requestData.url, state);
        resolved.params = this.resolveObject(requestData.params, state);
        resolved.headers = this.resolveObject(requestData.headers, state);

        // --- PENANGANAN BODY YANG DINAMIS ---
        if (requestData.body instanceof FormData) {
            // Kita harus membongkar FormData, resolve, lalu buat baru
            const newFormData = new FormData();
            for (const [key, value] of requestData.body.entries()) {
                const resolvedKey = this.resolveString(key, state);
                // Hanya resolve jika value adalah string (bukan File/Blob)
                const resolvedValue = typeof value === 'string' 
                    ? this.resolveString(value, state) 
                    : value; 
                newFormData.append(resolvedKey, resolvedValue);
            }
            resolved.body = newFormData;

        } else if (requestData.body instanceof URLSearchParams) {
            // Kita harus membongkar URLSearchParams, resolve, lalu buat baru
            const newSearchParams = new URLSearchParams();
            for (const [key, value] of requestData.body.entries()) {
                newSearchParams.append(
                    this.resolveString(key, state),
                    this.resolveString(value, state)
                );
            }
            resolved.body = newSearchParams;

        } else if (typeof requestData.body === 'string') {
            // Raw mode (JSON/Text)
            resolved.body = this.resolveString(requestData.body, state);
        }

        return resolved;
    }

    static resolveString(str, state) {
        if (typeof str !== 'string') return str;
    
        return str.replace(/\{\{\s*\$?(.+?)\s*\}\}/g, (match, key) => {
            const cleanKey = key.trim();
    
            // 1. Cek Dynamic Variables (Built-in)
            const dynamicVar = this.resolveDynamicVariable(cleanKey);
            if (dynamicVar !== null) return dynamicVar;
    
            // DEBUG: Lihat apa isi state kita
            // console.log("State saat ini:", state); 
    
            // 2. Cek Environment Vars (Data ada di state.environments)
            // Pastikan 'env_key' dan 'env_value' sesuai dengan struktur data di database/UI kamu
            const envs = state.environments || [];
            const envVar = envs.find(v => v.env_key === cleanKey);
            if (envVar) return envVar.env_value;
    
            // 3. Cek Global Vars (Data ada di state.globals)
            const globals = state.globals || [];
            const globalVar = globals.find(v => v.global_key === cleanKey);
            if (globalVar) return globalVar.global_value;
    
            // Jika sampai sini tidak ketemu, kembalikan apa adanya
            console.warn(`[RESOLVER] Variabel '${cleanKey}' tidak ditemukan di state!`);
            return match;
        });
    }

    static resolveObject(obj, state) {
        if (!obj) return {};
        const resolved = {};
        for (const [key, value] of Object.entries(obj)) {
            resolved[this.resolveString(key, state)] = this.resolveString(value, state);
        }
        return resolved;
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