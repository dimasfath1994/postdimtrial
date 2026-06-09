/**
 * RequestDispatcher
 * Bertugas mengirim request ke server dan mengembalikan response mentah.
 */
import { proxysendRequest } from "../../core/api/proxy-api.js";
export class RequestDispatcher {
    
    /**
     * @param {Object} data - { method, url, headers, params, body, useProxy }
     */
    static async send(data) {
        try {
            let { method, url, headers, params, body, useProxy } = data;
            
            // --- MENGGABUNGKAN PARAMS KE URL ---
            if (params && Object.keys(params).length > 0) {
                const searchParams = new URLSearchParams(params);
                const separator = url.includes('?') ? '&' : '?';
                url = `${url}${separator}${searchParams.toString()}`;
            }
            
            const finalUrl = url;

            const config = {
                method: method,
                headers: { ...headers }
            };

            // --- LOGIKA BODY DYNAMIC ---
            if (method !== 'GET' && method !== 'HEAD' && body !== null && body !== undefined) {
                if (body instanceof FormData) {
                    // FormData: Biarkan browser menentukan Content-Type (termasuk boundary)
                    // Hapus Content-Type manual agar browser menyisipkan boundary otomatis
                    config.body = body;
                    delete config.headers['Content-Type']; 
                } else if (body instanceof URLSearchParams) {
                    // URLSearchParams: Gunakan content-type standar form
                    config.body = body;
                    config.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                } else {
                    // Raw/JSON/Text: Gunakan stringify jika objek, atau kirim apa adanya
                    if (!config.headers['Content-Type']) {
                        config.headers['Content-Type'] = 'application/json';
                    }
                    config.body = typeof body === 'object' ? JSON.stringify(body) : body;
                }
            }

            console.log("[DEBUG] Sending Request with Config:", {
                url: finalUrl,
                method: method,
                headers: config.headers,
                body: body instanceof FormData ? "[FormData Object (Binary)]" : config.body 
            });

            // --- EKSEKUSI ---
            if (window.__TAURI__) {
                const { invoke } = window.__TAURI__;
                return await invoke('http_request', { 
                    method, 
                    url: finalUrl, 
                    headers: config.headers, 
                    body: config.body 
                });
            }

            const startTime = performance.now();
            const response = useProxy 
                ? await proxysendRequest(finalUrl, config, true)
                : await fetch(finalUrl, config);
            const endTime = performance.now();

            const duration = Math.round(endTime - startTime);
            const responseText = await response.text();
            
            return {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                body: responseText,
                time: duration,
                size: new Blob([responseText]).size
            };

        } catch (error) {
            console.error("[RequestDispatcher Error]", error);
            return {
                error: true,
                message: error.message
            };
        }
    }
}