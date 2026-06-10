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
            
            // --- 1. MENGGABUNGKAN PARAMS KE URL ---
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

            // --- 2. LOGIKA BODY DYNAMIC ---
            if (method !== 'GET' && method !== 'HEAD' && body !== null && body !== undefined) {
                const isTauri = window.__TAURI_INTERNALS__ !== undefined;
            
                if (body instanceof FormData) {
                    if (isTauri) {
                        // TAURI: Konversi ke Array untuk Rust
                        const multipartArray = [];
                        for (const [key, value] of body.entries()) {
                            multipartArray.push({
                                key: key,
                                // Jika object File, ambil path-nya. Jika text, string-kan.
                                value: value instanceof File ? (value.path || value.name) : String(value),
                                type: value instanceof File ? "file" : "text"
                            });
                        }
                        config.body = multipartArray;
                        delete config.headers['Content-Type'];
                    } else {
                        // WEB AS-IS: Biarkan FormData apa adanya
                        config.body = body;
                        delete config.headers['Content-Type'];
                    }
                } else if (body instanceof URLSearchParams) {
                    // Tauri butuh string untuk URLSearchParams agar bisa dikirim via bridge
                    config.body = isTauri ? body.toString() : body;
                    config.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                } else {
                    // Default JSON
                    if (!config.headers['Content-Type']) {
                        config.headers['Content-Type'] = 'application/json';
                    }
                    config.body = typeof body === 'object' ? JSON.stringify(body) : body;
                }
            }

            // --- 3. EKSEKUSI ---
            if (window.__TAURI_INTERNALS__ !== undefined) {
                // Coba deteksi berbagai variasi penempatan invoke
                const invoke = window.__TAURI__?.invoke || 
                window.__TAURI__?.core?.invoke || 
                window.__TAURI_INTERNALS__?.invoke || 
                window.__TAURI_INTERNALS__?.core?.invoke;

                // Konversi headers ke format array untuk Rust: [["Key", "Value"], ...]
                const headerArray = Object.entries(config.headers);
                
                // Panggil Rust (Tauri)
                const res = await invoke('http_request', { 
                    method, 
                    url: finalUrl, 
                    headers: headerArray, 
                    body: config.body || null 
                });

                // Normalisasi response dari Rust agar sama dengan format 'fetch'
                return {
                    status: res.status,
                    statusText: "OK", // Rust mengirim status code, kita bisa mock statusText
                    headers: Object.fromEntries(res.headers),
                    body: res.body,
                    time: res.time,
                    size: res.size
                };
            }
            // --- 4. EKSEKUSI WEB (FETCH) ---
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

    static async _readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result); // Mengembalikan base64
            reader.onerror = reject;
            reader.readAsDataURL(file); // Atau readAsArrayBuffer jika perlu
        });
    }
}