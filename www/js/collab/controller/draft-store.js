// draft-store.js
export const DraftStore = {
    // Kita gunakan sessionStorage agar data hilang jika browser ditutup, 
    // tapi aman saat pindah tab atau refresh.
    DEFAULTS: {
        url: '',
        method: 'GET',
        params: [],
        headers: [],
        body: '', // Ubah null ke string kosong agar lebih aman di editor
        name: 'New Request'
    },

    _ensure(id) {
        let store = JSON.parse(sessionStorage.getItem('draft_store') || '{}');
        if (!store[id]) {
            // Gunakan spread agar properti default terisi semua
            store[id] = { ...this.DEFAULTS };
            sessionStorage.setItem('draft_store', JSON.stringify(store));
        }
        return store[id];
    },

    getAll(id) {
        const store = JSON.parse(sessionStorage.getItem('draft_store') || '{}');
        // Gabungkan dengan default agar UI tidak error jika ada field yang missing
        return store[id] ? { ...this.DEFAULTS, ...store[id] } : null;
    },

    get(id, key) {
        const data = this._ensure(id);
        return data[key] !== undefined ? data[key] : this.DEFAULTS[key];
    },

    set(id, key, value) {
        // Proteksi agar tidak menulis null ke storage
        if (value === null) value = ''; 
        
        let store = JSON.parse(sessionStorage.getItem('draft_store') || '{}');
        if (!store[id]) store[id] = { ...this.DEFAULTS };
        
        store[id][key] = value;
        sessionStorage.setItem('draft_store', JSON.stringify(store));
    },

    remove(id) {
        let store = JSON.parse(sessionStorage.getItem('draft_store') || '{}');
        delete store[id];
        sessionStorage.setItem('draft_store', JSON.stringify(store));
    }
};