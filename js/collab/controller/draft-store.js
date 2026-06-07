// draft-store.js
export const DraftStore = {
    // Kita gunakan sessionStorage agar data hilang jika browser ditutup, 
    // tapi aman saat pindah tab atau refresh.
    _ensure(id) {
        let store = JSON.parse(sessionStorage.getItem('draft_store') || '{}');
        if (!store[id]) {
            store[id] = { 
                url: '', 
                method: 'GET', 
                params: [], 
                headers: [], 
                body: null, 
                name: 'New Request' 
            };
            sessionStorage.setItem('draft_store', JSON.stringify(store));
        }
        return store[id];
    },

    getAll(id) {
        const store = JSON.parse(sessionStorage.getItem('draft_store') || '{}');
        return store[id] || null; 
    },

    get(id, key) {
        return this._ensure(id)[key];
    },

    set(id, key, value) {
        let store = JSON.parse(sessionStorage.getItem('draft_store') || '{}');
        if (!store[id]) store[id] = {};
        store[id][key] = value;
        sessionStorage.setItem('draft_store', JSON.stringify(store));
    },

    remove(id) {
        let store = JSON.parse(sessionStorage.getItem('draft_store') || '{}');
        delete store[id];
        sessionStorage.setItem('draft_store', JSON.stringify(store));
    }
};