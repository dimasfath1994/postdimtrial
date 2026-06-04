/**
 * RequestDispatcher
 * Bertugas mengirim request ke server dan mengembalikan response mentah.
 */
export class RequestDispatcher {
    
    /**
     * @param {Object} data - { method, url, headers, body, useProxy }
     */
    static async send(data) {
        try {
            let { method, url, headers, params, body, useProxy } = data;
            
            // --- MENGGABUNGKAN PARAMS KE URL ---
            if (params && Object.keys(params).length > 0) {
                const searchParams = new URLSearchParams(params);
                // Tambahkan ke URL, tangani jika sudah ada query di URL asal
                const separator = url.includes('?') ? '&' : '?';
                url = `${url}${separator}${searchParams.toString()}`;
            }
            // Jika menggunakan proxy, arahkan request melalui proxy
            // (Asumsi: ada endpoint proxy lokal di /api/proxy)
            const finalUrl = useProxy ? `/api/proxy?url=${encodeURIComponent(url)}` : url;

            const config = {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                }
            };

            console.log("[DEBUG] Sending Request with Config:", {
                url: finalUrl,
                method: method,
                headers: config.headers, // Ini akan menunjukkan isi header yang sebenarnya dikirim
                body: config.body
            });

            // Tambahkan body jika method bukan GET/HEAD
            if (method !== 'GET' && method !== 'HEAD' && body) {
                config.body = typeof body === 'object' ? JSON.stringify(body) : body;
            }

            // --- EKSEKUSI ---
            // Jika di Tauri (desktop), kita bisa menggunakan invoke ke Rust untuk bypass CORS
            if (window.__TAURI__) {
                const { invoke } = window.__TAURI__;
                return await invoke('http_request', { method, url, headers, body: config.body });
            }

            const startTime = performance.now();
            // Jika di Browser/Web, gunakan fetch standar
            const response = await fetch(finalUrl, config);
            const endTime = performance.now();

            const duration = Math.round(endTime - startTime);
            const responseText = await response.text();
            
            // Mengembalikan objek response yang sudah dibaca (Raw-ish)
            return {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                body: responseText,
                time: duration, // Kirim durasi ke handler
                size: new Blob([responseText]).size // Hitung ukuran byte
            };

        } catch (error) {
            return {
                error: true,
                message: error.message
            };
        }
    }
}