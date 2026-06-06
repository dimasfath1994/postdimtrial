/**
 * draft-store.js
 */
export const DraftStore = {
    data: {},

    _ensure(id) {
        if (!this.data[id]) {
            this.data[id] = { 
                url: '', 
                method: 'GET', 
                params: [], 
                headers: [], 
                body: null, 
                name: 'New Request' 
            };
        }
        return this.data[id];
    },

    get(id, key) {
        return this._ensure(id)[key];
    },

    set(id, key, value) {
        this._ensure(id)[key] = value;
    },

    remove(id) {
        if (this.data[id]) {
            delete this.data[id];
        }
    }
};