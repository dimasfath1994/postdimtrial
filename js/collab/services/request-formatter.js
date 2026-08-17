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
        const headers = this.getHeaders(State);
        const mode = document.getElementById('bodyModeSelect')?.value;

        // Otomatis tambahkan Content-Type: application/json jika mode GraphQL dan header belum ada
        if (mode === 'graphql') {
            const hasContentType = Object.keys(headers).some(
                k => k.toLowerCase() === 'content-type'
            );
            if (!hasContentType) {
                headers['Content-Type'] = 'application/json';
            }
        }

        return {
            method: document.getElementById('method').value,
            url: document.getElementById('url').value.trim(),
            headers: headers,
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
        const mode = document.getElementById('bodyModeSelect')?.value;
        switch (mode) {
            case 'raw':
                return document.getElementById('body').value;
            case 'form-data':
                return await this.getFormData(); // Sekarang async
            case 'urlencoded':
                return this.getUrlEncoded();
            case 'graphql':
                return this.getGraphQL();
            default:
                return null;
        }
    }

    /**
     * Memformat input GraphQL dari UI menjadi JSON string { query, variables }
     */
    static getGraphQL() {
        const query = document.getElementById('graphqlQuery')?.value || '';
        const varsRaw = document.getElementById('graphqlVariables')?.value || '{}';

        let variables = {};
        try {
            variables = typeof varsRaw === 'string' && varsRaw.trim() !== '' 
                ? JSON.parse(varsRaw) 
                : {};
        } catch (e) {
            console.warn('[RequestFormatter] JSON Variables GraphQL tidak valid:', e);
            variables = {};
        }

        return JSON.stringify({
            query: query,
            variables: variables
        });
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
        const params = window.bodyParamCtrl?.State?.bodyParams || [];
        const searchParams = new URLSearchParams();
        params.filter(p => p.enabled === true || p.enabled === 1).forEach(p => {
            if (p.key) searchParams.append(p.key, p.value || "");
        });
        return searchParams; 
    }
}