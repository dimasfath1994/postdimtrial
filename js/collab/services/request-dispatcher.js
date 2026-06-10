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
            const { method, url, headers, params, body, useProxy } = data;
            
            // 1. Persiapan URL & Headers
            let finalUrl = url;
            if (params && Object.keys(params).length > 0) {
                finalUrl += (finalUrl.includes('?') ? '&' : '?') + new URLSearchParams(params).toString();
            }
            
            const config = { method, headers: { ...headers } };

            // 2. Pusat Logika Body (Hanya diproses sekali)
            this._processBody(config, body, method);

            // 3. Eksekusi Berdasarkan Environment
            return await this._execute(finalUrl, config, method, useProxy);

        } catch (err) {
            console.error("[RequestDispatcher Error]", err);
            return { error: true, message: err.message };
        }
    }

    // Helper untuk memproses body secara transparan
    static _processBody(config, body, method) {
        if (['GET', 'HEAD'].includes(method.toUpperCase()) || body == null) return;

        if (body instanceof FormData) {
            // Untuk Tauri, kita butuh array format. Untuk Fetch, biarkan FormData
            if (window.__TAURI_INTERNALS__) {
                config.body = Array.from(body.entries()).map(([k, v]) => ({
                    key: k,
                    value: v instanceof File ? (v.path || v.name) : String(v),
                    type: v instanceof File ? "file" : "text"
                }));
            } else {
                config.body = body;
            }
            delete config.headers['Content-Type'];
        } else if (body instanceof URLSearchParams) {
            config.body = body.toString();
            config.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        } else {
            config.headers['Content-Type'] = config.headers['Content-Type'] || 'application/json';
            config.body = typeof body === 'object' ? JSON.stringify(body) : body;
        }
    }

    // Helper Eksekusi
    static async _execute(url, config, method, useProxy) {
        const tauriInvoke = window.__TAURI_INTERNALS__?.core?.invoke || window.__TAURI__?.invoke;

        if (tauriInvoke) {
            const res = await tauriInvoke('http_request', { 
                method, url, headers: Object.entries(config.headers), body: config.body 
            });
            return { ...res, statusText: "OK", headers: Object.fromEntries(res.headers) };
        }

        // Fetch Web
        const start = performance.now();
        const res = useProxy ? await proxysendRequest(url, config, true) : await fetch(url, config);
        const body = await res.text();
        return {
            status: res.status,
            statusText: res.statusText,
            headers: Object.fromEntries(res.headers.entries()),
            body,
            time: Math.round(performance.now() - start),
            size: new Blob([body]).size
        };
    }
}