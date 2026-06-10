import { RequestBodyParamService } from "../request-body-param-service.js";
import { DataBridge } from '../controller/bridge.js'; // Pastikan import ini

/**
 * RequestFormatter
 * Mengambil data mentah dari UI dan memformatnya menjadi objek request standar.
 */
export class RequestFormatter {
    
    /**
     * Mengambil semua input dari form UI
     * @returns {Promise<Object>} { method, url, headers, params, body, useProxy }
     */
    static async collectFromUI(State) {
        return {
            method: document.getElementById('method').value,
            url: document.getElementById('url').value.trim(),
            headers: this.getHeaders(State),
            params: this.getParams(State), 
            body: await this.getBody(), // Sekarang async
            useProxy: document.getElementById('use-proxy')?.checked || false
        };
    }

    static getParams(State) {
        const params = {};
        if (State.params && Array.isArray(State.params)) {
            State.params.forEach(p => {
                const isEnabled = p.enabled === true || p.enabled === 1 || p.enabled === 'true';
                if (p.key && p.key.trim() !== "" && isEnabled) {
                    params[p.key] = p.value ? p.value.trim() : "";
                }
            });
        }
        return params;
    }

    static getHeaders(State) {
        const headers = {};
        if (State.headers && Array.isArray(State.headers)) {
            State.headers.forEach(h => {
                const isEnabled = h.enabled === true || h.enabled === 1 || h.enabled === 'true';
                if (h.key && h.key.trim() !== "" && isEnabled) {
                    headers[h.key] = h.value ? h.value.trim() : "";
                }
            });
        }
        return headers;
    }

    static async getBody() {
        const mode = document.getElementById('bodyModeSelect').value;
        const isTauri = window.__TAURI_INTERNALS__ !== undefined;
    
        switch (mode) {
            case 'raw':
                return document.getElementById('body').value;
            case 'form-data':
                // Panggil fungsi yang sesuai dengan environment
                return isTauri ? await this.getFormDataTauri() : await this.getFormData();
            case 'urlencoded':
                return this.getUrlEncoded();
            default:
                return null;
        }
    }

    /**
 * Versi optimasi khusus untuk Tauri: Mengembalikan Array untuk diproses Rust
 * Menggunakan parallel processing dengan Promise.all
 */
static async getFormDataTauri() {
    const params = window.bodyParamCtrl?.State?.bodyParams || [];
    const requestId = window.bodyParamCtrl.currentRequestId;
    const isDraft = String(requestId).startsWith('draft_');

    // Gunakan filter dan map secara sinkron untuk menyiapkan list task
    const activeParams = params.filter(p => p.enabled === true || p.enabled === 1);

    // Jalankan semua proses pengambilan data file secara paralel (tidak nunggu satu-satu)
    const results = await Promise.all(activeParams.map(async (p) => {
        if (!p.key) return null;

        if (p.type === 'file') {
            // 1. Prioritas: File object dari memory
            if (p.file instanceof File) {
                return { key: p.key, value: p.file.path || p.file.name, type: "file" };
            } 
            // 2. Jika tidak ada, ambil dari sumber (Draft atau Server)
            else if (p.value) {
                try {
                    // Logic ini sekarang berjalan paralel untuk semua file
                    const blob = isDraft 
                        ? await DataBridge.getBlob(requestId, 'bodyParams', p.id)
                        : await RequestBodyParamService.downloadFileAsBlob(p.value);
                    
                    // Di Tauri, kita tidak perlu File object, kita butuh "Path"
                    // Catatan: Jika ini blob dari server, sistem butuh mekanisme simpan ke temp path
                    // Jika path sudah ada di p.value, kita gunakan p.value
                    return { key: p.key, value: p.value, type: "file" };
                } catch (e) {
                    console.error(`[FormDataTauri] Gagal fetch file: ${p.key}`, e);
                    return null;
                }
            }
        }

        // Default: Text field
        return { key: p.key, value: String(p.value || ""), type: "text" };
    }));

    // Filter null values dan kembalikan array untuk lib.rs
    return results.filter(Boolean);
}

    /**
     * Mengambil data dari State controller, memproses file biner jika perlu.
     */
    static async getFormData() {
        const params = window.bodyParamCtrl?.State?.bodyParams || [];
        const formData = new FormData();
        
        for (const p of params.filter(p => p.enabled === true || p.enabled === 1)) {
            if (!p.key) continue;

            if (p.type === 'file') {
                // 1. Prioritas: File object yang sudah ada di memory (hasil input user)
                if (p.file instanceof File) {
                    formData.append(p.key, p.file);
                } 
                // 2. Jika tidak ada, tapi ada value (path string), ambil blob dari server
               // Analisis di tempat kamu memproses FormData:
                else if (p.value) {
                    try {
                        let blob;
                        const isDraft = String(window.bodyParamCtrl.currentRequestId).startsWith('draft_');

                        if (isDraft) {
                            // Panggil helper yang baru kita buat
                            blob = await DataBridge.getBlob(window.bodyParamCtrl.currentRequestId, 'bodyParams', p.id);
                        } else {
                            // Tetap pakai logika lama untuk request server
                            blob = await RequestBodyParamService.downloadFileAsBlob(p.value);
                        }

                        if (blob) {
                            const file = new File([blob], p.file_name || "downloaded_file");
                            formData.append(p.key, file);
                        }
                    } catch (e) {
                        console.error(`[FormData] Gagal menyiapkan file: ${p.key}`, e);
                    }
                }
            } else {
                formData.append(p.key, p.value || "");
            }
        }
        return formData;
    }

    static getUrlEncoded() {
        var isTauri = window.__TAURI_INTERNALS__ !== undefined;
        const params = window.bodyParamCtrl?.State?.bodyParams || [];
        const searchParams = new URLSearchParams();
        params.filter(p => p.enabled === true || p.enabled === 1).forEach(p => {
            if (p.key) searchParams.append(p.key, p.value || "");
        });
        if (isTauri) { return searchParams.toString(); }
        return searchParams; 
    }
}