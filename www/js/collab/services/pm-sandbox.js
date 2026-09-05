// services/pm-sandbox.js
export class PMSandbox {
    /**
     * @param {string} script - Kode JS dari editor
     * @param {object} response - Data response dari request
     * @param {object} state - Referensi state global
     * @param {object} envCtrl - Instance dari EnvController
     */
    static async execute(script, response, state, envCtrl) {
        
        // Objek PM yang akan disuntikkan ke dalam script
        const pm = {
            variables: {
                get: (key) => state.runtimeVariables?.[key],
                set: (key, value) => {
                    state.runtimeVariables ||= {};
                    state.runtimeVariables[key] = value;
                },
                unset: (key) => {
                    if (state.runtimeVariables) delete state.runtimeVariables[key];
                },
                all: () => ({ ...(state.runtimeVariables || {}) })
            },
            response: {
                json: () => {
                    try { return response?.body ? JSON.parse(response.body) : null; } 
                    catch (e) { return null; }
                },
                text: () => response?.body || ""
            },
            environment: {
                // Mengambil nilai dari State melalui controller
                get: (key) => envCtrl.getValue(key),
                
                // Menyimpan/Update nilai (Persistent & Sinkron) melalui controller
                set: (key, value) => envCtrl.updateByName(key, value)
            }
        };

        // Eksekusi script di dalam sandbox
        try {
            const func = new Function('pm', script);
            func(pm);
            console.log("[PMSandbox] Script selesai dijalankan.");
        } catch (e) {
            console.error("[Script Error]", e);
        }
    }
}