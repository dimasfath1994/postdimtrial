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
        switch (mode) {
            case 'raw':
                return document.getElementById('body').value;
            case 'form-data':
                return await this.getFormData(); // Sekarang async
            case 'urlencoded':
                return this.getUrlEncoded();
            default:
                return null;
        }
    }

    /**
     * Mengambil data dari State controller, memproses file biner jika perlu.
     */
    static async getFormData() {
        const params = window.bodyParamCtrl?.State?.bodyParams || [];
        
        // Deteksi apakah berjalan di environment Tauri
        const isTauri = window.__TAURI_INTERNALS__ !== undefined;
    
        // Jika Tauri, kita siapkan array untuk dikirim ke Rust. 
        // Jika bukan, kita pakai FormData seperti biasa.
        const output = isTauri ? [] : new FormData();
    
        for (const p of params.filter(p => p.enabled === true || p.enabled === 1)) {
            if (!p.key) continue;
    
            if (p.type === 'file') {
                if (isTauri) {
                    // TAURI LOGIC: Ambil path file dari p.file (yang di-set via dialog)
                    output.push({
                        key: p.key,
                        value: p.file?.path || p.value || "", 
                        type: "file"
                    });
                } else {
                    // WEB LOGIC AS-IS:
                    // 1. Prioritas: File object yang sudah ada di memory
                    if (p.file instanceof File) {
                        output.append(p.key, p.file);
                    } 
                    // 2. Jika tidak ada, tapi ada value (path string), ambil blob dari server
                    else if (p.value) {
                        try {
                            let blob;
                            const isDraft = String(window.bodyParamCtrl.currentRequestId).startsWith('draft_');
    
                            if (isDraft) {
                                blob = await DataBridge.getBlob(window.bodyParamCtrl.currentRequestId, 'bodyParams', p.id);
                            } else {
                                blob = await RequestBodyParamService.downloadFileAsBlob(p.value);
                            }
    
                            if (blob) {
                                const file = new File([blob], p.file_name || "downloaded_file");
                                output.append(p.key, file);
                            }
                        } catch (e) {
                            console.error(`[FormData] Gagal menyiapkan file: ${p.key}`, e);
                        }
                    }
                }
            } else {
                // Penanganan text/key-value biasa
                if (isTauri) {
                    output.push({
                        key: p.key,
                        value: p.value || "",
                        type: "text"
                    });
                } else {
                    output.append(p.key, p.value || "");
                }
            }
        }
        return output;
    }

    static getUrlEncoded() {
        const params = window.bodyParamCtrl?.State?.bodyParams || [];
        const searchParams = new URLSearchParams();
        
        params.filter(p => p.enabled === true || p.enabled === 1).forEach(p => {
            if (p.key) searchParams.append(p.key, p.value || "");
        });
    
        // Jika di Tauri, kirim string-nya saja
        if (window.__TAURI_INTERNALS__ !== undefined) {
            return searchParams.toString(); 
        }
        
        return searchParams; 
    }
}