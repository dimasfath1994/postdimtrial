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
        const isTauri = window.__TAURI_INTERNALS__ !== undefined;
    
        // Jika Tauri, return Array; jika Web, return FormData (as-is)
        const output = isTauri ? [] : new FormData();
        
        for (const p of params.filter(p => p.enabled === true || p.enabled === 1)) {
            if (!p.key) continue;
    
            if (p.type === 'file') {
                if (isTauri) {
                    // TAURI: Kirim path file ke Rust agar Rust yang membaca file-nya
                    output.push({
                        key: p.key,
                        value: p.file?.path || p.value || "",
                        type: "file"
                    });
                } else {
                    // WEB AS-IS: Logika asli tetap berjalan tanpa tersentuh
                    if (p.file instanceof File) {
                        output.append(p.key, p.file);
                    } else if (p.value) {
                        try {
                            let blob;
                            const isDraft = String(window.bodyParamCtrl.currentRequestId).startsWith('draft_');
                            blob = isDraft ? await DataBridge.getBlob(window.bodyParamCtrl.currentRequestId, 'bodyParams', p.id) 
                                           : await RequestBodyParamService.downloadFileAsBlob(p.value);
                            if (blob) output.append(p.key, new File([blob], p.file_name || "downloaded_file"));
                        } catch (e) { console.error(e); }
                    }
                }
            } else {
                // Text field
                isTauri ? output.push({ key: p.key, value: p.value || "", type: "text" }) 
                        : output.append(p.key, p.value || "");
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
        
        // Jika Tauri, return string agar bisa langsung diproses sbg body string
        return (window.__TAURI_INTERNALS__ !== undefined) ? searchParams.toString() : searchParams;
    }
}