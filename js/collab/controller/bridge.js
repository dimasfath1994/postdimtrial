/**
 * bridge.js
 */
import { DraftStore } from './draft-store.js';

export const DataBridge = {
    
    // Mengambil nilai spesifik
    load(id, key, originalState) {
        if (String(id).startsWith('draft_')) {
            return DraftStore.get(id, key);
        }
        return originalState[key]; 
    },

    // Menyimpan nilai spesifik
    save(id, key, value, originalState) {
        if (String(id).startsWith('draft_')) {
            DraftStore.set(id, key, value);
        } else {
            originalState[key] = value;
        }
    },

    // MENGAMBIL SEMUA DATA (Penting untuk inisialisasi Tab)
    getAll(id) {
        if (String(id).startsWith('draft_')) {
            return DraftStore._ensure(id);
        }
        return null;
    },

    // Membersihkan data draft saat tab ditutup
    cleanup(id) {
        if (String(id).startsWith('draft_')) {
            DraftStore.remove(id);
        }
    }
};