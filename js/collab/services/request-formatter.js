/**
 * RequestFormatter
 * Mengambil data mentah dari UI dan memformatnya menjadi objek request standar.
 */
export class RequestFormatter {
    
    /**
     * Mengambil semua input dari form UI
     * @returns {Object} { method, url, headers, body, useProxy }
     */
    static collectFromUI(State) {
        return {
            method: document.getElementById('method').value,
            url: document.getElementById('url').value.trim(),
            headers: this.getHeaders(State),
            params: this.getParams(State), 
            body: this.getBody(),
            useProxy: document.getElementById('use-proxy')?.checked || false
        };
    }

    static getParams(State) {
        const params = {};
        
        if (State.params && Array.isArray(State.params)) {
            State.params.forEach(p => {
                // Asumsi struktur State.params mirip dengan headers (ada key, value, enabled)
                const isEnabled = p.enabled === true || p.enabled === 'true';
                
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
                // Kita tambahkan pengecekan: 
                // 1. Key tidak kosong
                // 2. Header dalam keadaan 'enabled' (centang)
                const isEnabled = h.enabled === true || h.enabled === 'true'; // Handle jika string/boolean
                
                if (h.key && h.key.trim() !== "" && isEnabled) {
                    headers[h.key] = h.value ? h.value.trim() : "";
                }
            });
        }
        return headers;
    }

    static getBody() {
        const mode = document.getElementById('bodyModeSelect').value;
        
        switch (mode) {
            case 'raw':
                return document.getElementById('body').value;
            case 'form-data':
                // Logic untuk mengumpulkan form-data
                return this.getFormData();
            case 'urlencoded':
                return this.getUrlEncoded();
            default:
                return null;
        }
    }

    static getFormData() {
        // Implementasi sesuaikan dengan struktur HTML list form-data mu
        const data = {};
        const rows = document.querySelectorAll('#formDataList .env-row');
        rows.forEach(row => {
            const k = row.querySelector('.v-key')?.value;
            const v = row.querySelector('.v-val')?.value;
            if (k) data[k] = v;
        });
        return data;
    }

    static getUrlEncoded() {
        const data = {};
        const rows = document.querySelectorAll('#urlencodedList .env-row');
        rows.forEach(row => {
            const k = row.querySelector('.v-key')?.value;
            const v = row.querySelector('.v-val')?.value;
            if (k) data[k] = v;
        });
        return data;
    }
}