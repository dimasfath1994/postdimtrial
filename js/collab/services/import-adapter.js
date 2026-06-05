/**
 * ImportAdapter.js
 * Bertugas mengubah berbagai format JSON (Postman, Native) 
 * menjadi struktur internal yang seragam untuk di-import.
 */

export const ImportAdapter = {
    
    /**
     * Normalize: Mengubah input data ke format internal kita
     */
    async normalize(fileData, sourceType) {
        if (sourceType === 'postman') {
            return this.fromPostman(fileData);
        }
        // Default ke 'native' (format ekspor kita sendiri)
        return fileData;
    },

    /**
     * Mengonversi format Postman ke struktur internal
     */
    fromPostman(data) {
        return {
            name: data.info?.name || "Imported Collection",
            // Postman memetakan 'item' sebagai koleksi atau folder
            collections: data.item.map(item => this.mapPostmanItem(item))
        };
    },

    /**
     * Mapper Rekursif: Memproses folder dan request secara mendalam
     */
    mapPostmanItem(item) {
        const isFolder = !!item.item; // Jika punya properti 'item', berarti dia folder
        
        if (isFolder) {
            return {
                name: item.name,
                folders: item.item
                    .filter(i => i.item) // Hanya ambil folder
                    .map(i => this.mapPostmanItem(i)),
                requests: item.item
                    .filter(i => !i.item) // Hanya ambil request
                    .map(i => this.mapPostmanRequest(i))
            };
        } else {
            // Jika item adalah request tunggal di root koleksi
            return {
                name: item.name,
                folders: [],
                requests: [this.mapPostmanRequest(item)]
            };
        }
    },

    /**
     * Pemetaan Request Postman ke Format Internal
     */
    mapPostmanRequest(req) {
        const request = req.request || {};
        
        return {
            name: req.name || "Untitled",
            method: request.method || "GET",
            url: typeof request.url === 'string' ? request.url : request.url?.raw || "",
            body: {
                mode: request.body?.mode || "none",
                raw: request.body?.raw || "",
                formData: request.body?.formdata || [],
                urlencoded: request.body?.urlencoded || []
            },
            headers: (request.header || []).map(h => ({
                key: h.key,
                value: h.value,
                enabled: !h.disabled
            })),
            params: (request.url?.query || []).map(p => ({
                key: p.key,
                value: p.value,
                enabled: !p.disabled
            })),
            // Default placeholder untuk data yang tidak ada di Postman
            auth: { type: "", value: "" },
            scripts: { pre: "", post: "" }
        };
    }
};