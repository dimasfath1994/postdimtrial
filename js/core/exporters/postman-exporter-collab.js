/**
 * Postman Exporter Collab
 * Versi Full (Data Aggregator Compatible)
 */

// Helper untuk memastikan data yang diproses benar-benar memiliki key yang valid
function sanitizeEntry(entry) {
    // 1. Jika input berupa array/object, pastikan ada key yang bukan angka/indeks
    // 2. Jika key-nya adalah "0" atau angka indeks, abaikan.
    
    // Asumsi: data adalah objek {key: "...", value: "...", ...} 
    // atau { "nama_key": {value: "..."} }
    
    if (!entry) return null;

    // Jika data adalah array dan itemnya punya properti key/name
    if (entry.key && entry.key !== "0") return entry;
    if (entry.name && entry.name !== "0") return { ...entry, key: entry.name };
    
    return null;
}

function parsePostmanUrl(rawUrl = "", params = {}) {
    try {
        const u = new URL(rawUrl);
        // Hapus query string lama dari URL agar tidak terinfeksi "0"
        u.search = ""; 
        
        let queryData = [];
        if (Array.isArray(params)) {
            queryData = params.filter(p => p.key && p.key !== "0");
        } else {
            queryData = Object.entries(params)
                .filter(([key, val]) => key && key !== "0")
                .map(([key, val]) => ({ key, value: val.value || "" }));
        }

        queryData.forEach(p => u.searchParams.set(p.key, p.value));

        return {
            raw: u.toString(),
            protocol: u.protocol.replace(":", ""),
            host: u.hostname.split("."),
            port: u.port ? u.port : undefined,
            path: u.pathname.split("/").filter(Boolean),
            query: queryData.map(p => ({ key: p.key, value: p.value, disabled: false }))
        };
    } catch {
        return { raw: rawUrl };
    }
}

function mapHeaders(headers = {}) {
    if (Array.isArray(headers)) {
        return headers
            .filter(h => h.key && h.key !== "0")
            .map(h => ({ key: h.key, value: h.value || "", disabled: !h.enabled }));
    }
    
    return Object.entries(headers)
        .filter(([key, item]) => key && key !== "0")
        .map(([key, item]) => ({
            key: key,
            value: item.value || "",
            disabled: !item.enabled
        }));
}

function mapBody(tab) {

    // 1. Ambil mode dari tab.body (default ke 'raw' jika tidak ada)
    const mode = tab.body_mode || "raw";
    
    // 2. Siapkan struktur dasar body Postman
    const postmanBody = {
        // Memastikan mode tidak undefined, lalu normalisasi nama "form-data" menjadi "formdata"
        mode: (mode === "form-data" || mode === "formdata") ? "formdata" : (mode || "raw")
    };
    // 3. Proses berdasarkan mode
    if (tab.body) {
        postmanBody.raw = typeof tab.body === 'string' ? tab.body : (tab.body || "");
        postmanBody.options = { raw: { language: "json" } };
    } 
    else if (tab.bodyParams.length > 0) {
        // Ambil data array-nya (sesuaikan dengan nama properti di datamu)
        // Kita gunakan .filter untuk membuang key "0" yang tidak valid
        postmanBody[postmanBody.mode] = tab.bodyParams
        .filter(item => item && item.key && item.key !== "0")
        .map(item => ({
            key: item.key,
            value: item.value || "",
            type: item.type || "text",
            disabled: item.enabled === false
        }));
    }

    return postmanBody;
}

function mapAuth(auth = {}) {
    if (!auth.type) return undefined;
    if (auth.type === "bearer") {
        return {
            type: "bearer",
            bearer: [{ key: "token", value: auth.value, type: "string" }]
        };
    }
    if (auth.type === "apiKey") {
        return {
            type: "apikey",
            apikey: [
                { key: "value", value: auth.value, type: "string" },
                { key: "key", value: "x-api-key", type: "string" },
                { key: "in", value: "header", type: "string" }
            ]
        };
    }
    return undefined;
}

function mapEvents(tab) {
    const events = [];
    if (tab.scripts?.pre?.trim()) {
        events.push({
            listen: "prerequest",
            script: { type: "text/javascript", exec: tab.scripts.pre.split("\n") }
        });
    }
    if (tab.scripts?.post?.trim()) {
        events.push({
            listen: "test",
            script: { type: "text/javascript", exec: tab.scripts.post.split("\n") }
        });
    }
    return events;
}

function mapRequest(tab) {
    const request = {
        method: tab.method || "GET",
        header: mapHeaders(tab.headers),
        url: parsePostmanUrl(tab.url, tab.params)
    };
    const hasBodyData = (tab.body && tab.body !== "null") || 
    (tab.body_mode && tab.body_mode !== "none") || 
    (Array.isArray(tab.bodyParams) && tab.bodyParams.length > 0);

    if (hasBodyData) {
    request.body = mapBody(tab);
    }

    const auth = mapAuth(tab.auth);
    if (auth) request.auth = auth;

    const result = {
        name: tab.name,
        request,
        response: []
    };
    const events = mapEvents(tab);
    if (events.length) result.event = events;
    return result;
}

function mapEnvironment(environment = {}) {
    return Object.entries(environment).map(([key, value]) => ({
        key,
        value,
        enabled: true
    }));
}

export function exportPostmanCollection(collection) {
    // collection.folders adalah array yang sudah di-build oleh Aggregator
    // collection.rootRequests adalah request tanpa folder
    const folders = collection.folders || [];
    const rootRequests = collection.rootRequests || [];

    const processFolders = (folderList) => {
        return folderList.map(folder => ({
            name: folder.name,
            item: [
                ...(folder.folders ? processFolders(folder.folders) : []),
                ...(folder.requests || []).map(mapRequest)
            ]
        }));
    };

    const finalItems = [
        ...processFolders(folders),
        ...rootRequests.map(mapRequest)
    ];

    return {
        info: {
            _postman_id: crypto.randomUUID(),
            name: collection.name,
            schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
        },
        item: finalItems,
        variable: mapEnvironment(collection.environment || {})
    };
}