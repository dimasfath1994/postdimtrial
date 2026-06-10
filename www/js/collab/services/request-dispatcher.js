/**
 * RequestDispatcher
 * Bertugas mengirim request ke server dan mengembalikan response mentah.
 */
import { proxysendRequest } from "../../core/api/proxy-api.js";

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = (error) => reject(error);
});

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
                if (body instanceof FormData) {
                    config.body = body;
                    delete config.headers['Content-Type']; 
                } else if (body instanceof URLSearchParams) {
                    config.body = body;
                    config.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                } else {
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

                // =============================================================
                // INTERSEPTOR IPC TAURI: Konversi Objek Browser ke Raw Serializable
                // =============================================================
                let tauriBody = config.body;

                if (body instanceof FormData) {
                    // 1. Ekstrak semua entri [key, value] langsung dari objek FormData yang sudah matang
                    const entries = Array.from(body.entries());
                    
                    // 2. Proses semua entri secara paralel (Anti-Waterfall)
                    const promises = entries.map(async ([key, value]) => {
                        let itemType = "text";
                        let itemValue = value;
                        let fileB64 = null;
                        let fileName = "";
                        let isPath = false;
                
                        // Jika value adalah instance dari File (berhasil dideteksi otomatis oleh browser)
                        if (value instanceof File) {
                            itemType = "file";
                            fileB64 = await fileToBase64(value); // Konversi ke Base64
                            fileName = value.name;
                            itemValue = ""; // Kosongkan string karena data biner pindah ke file_b64
                        } else {
                            itemValue = String(value || "");
                        }
                
                        return {
                            key: key,
                            value: itemValue,
                            type: itemType,
                            file_b64: fileB64,
                            file_name: fileName,
                            is_path: isPath
                        };
                    });
                
                    // 3. Tunggu hingga semua file selesai dikonversi, lalu masukkan ke tauriBody
                    tauriBody = await Promise.all(promises);
                    config.headers['Content-Type'] = 'multipart/form-data';
                } else if (body instanceof URLSearchParams) {
                    // Konversi URLSearchParams menjadi string flat urlencoded biasa
                    tauriBody = body.toString();
                    config.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                }

                // Susun ulang header array setelah kemungkinan modifikasi Content-Type di atas
                const headerArray = Object.entries(config.headers);

                // Panggil Rust (Tauri)
                const res = await invoke('http_request_collabs', { 
                    method, 
                    url: finalUrl, 
                    headers: headerArray, 
                    body: tauriBody || null 
                });

                // Normalisasi response dari Rust agar sama dengan format 'fetch'
                return {
                    status: res.status,
                    statusText: "OK", 
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

}