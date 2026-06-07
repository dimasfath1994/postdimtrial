/**
 * bridge.js
 */
import { DraftStore } from './draft-store.js';

// Helper internal untuk generate ID unik dengan namespace
const generateId = (prefix = 'item') => `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

export const DataBridge = {
    
    // Mengambil nilai spesifik
    load(id, key, originalState) {
        if (String(id).startsWith('draft_')) {
            return DraftStore.get(id, key);
        }
        return originalState ? originalState[key] : null; 
    },

    // Menyimpan nilai spesifik
    save(id, key, value, originalState = null) {
        if (String(id).startsWith('draft_')) {
            DraftStore.set(id, key, value);
        } else if (originalState) {
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

    // PUSH dengan pengamanan Array dan Auto-Generate ID
    push(id, key, item) {
        if (String(id).startsWith('draft_')) {
            let arr = DraftStore.get(id, key);
            
            // Pengamanan: Pastikan data adalah array
            if (!Array.isArray(arr)) arr = [];
            
            // Auto-Generate ID jika belum ada
            if (!item.id) {
                // Menggunakan 4 huruf pertama dari key sebagai prefix (misal: para, head)
                const prefix = key.slice(0, 4);
                item.id = generateId(prefix);
            }
            
            arr.push(item);
            DraftStore.set(id, key, arr);
        }
    },

    // Mengupdate item spesifik di dalam array
    updateArray(id, key, itemId, newItemData) {
        if (String(id).startsWith('draft_')) {
            let arr = DraftStore.get(id, key);
            
            if (!Array.isArray(arr)) arr = [];
            
            const idx = arr.findIndex(item => item.id === itemId);
            if (idx !== -1) {
                arr[idx] = { ...arr[idx], ...newItemData };
                DraftStore.set(id, key, arr);
            }
        }
    },

    bulkCreate(id, key, items) {
        if (String(id).startsWith('draft_')) {
            const prefix = key.slice(0, 4);
            // Pastikan setiap item memiliki ID yang unik sebelum disimpan
            const processedItems = items.map(item => ({
                ...item,
                id: item.id || generateId(prefix)
            }));
            
            DraftStore.set(id, key, processedItems);
            return processedItems;
        }
    },

    // Menghapus item dari array
    removeFromArray(id, key, itemId) {
        if (String(id).startsWith('draft_')) {
            let arr = DraftStore.get(id, key);
            
            if (!Array.isArray(arr)) arr = [];
            
            arr = arr.filter(item => item.id !== itemId);
            DraftStore.set(id, key, arr);
        }
    },

    // Membersihkan data draft saat tab ditutup
    cleanup(id) {
        if (String(id).startsWith('draft_')) {
            DraftStore.remove(id);
        }
    }
};