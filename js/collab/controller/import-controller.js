import { ImportSequenceInserter } from "../services/import-sequence-inserter.js";
import { ImportPostmanInserter } from "../services/import-postman-inserter.js";

export const ImportController = {
    
    /**
     * Fungsi utama untuk menangani proses import dari UI
     * @param {File} file - File objek dari input
     * @param {string} mode - 'workspace' atau 'collection'
     * @param {number} activeWorkspaceId - ID workspace saat ini
     * @param {number} userId - ID user yang sedang login
     */
    async handleImport(file, mode, activeWorkspaceId, userId) {
        try {
            console.log("Memulai proses import...");

            // 1. Baca File
            const fileContent = await this.readFileAsText(file);
            const rawData = JSON.parse(fileContent);

            // 2. Deteksi Format dan Eksekusi Inserter
            // Format Postman memiliki properti 'info' dan 'item'
            const isPostman = rawData.info && rawData.item;

            let result;
            if (isPostman) {
                console.log("Mendeteksi format: Postman");
                result = await ImportPostmanInserter.import(rawData, mode, activeWorkspaceId, userId);
            } else {
                console.log("Mendeteksi format: Native");
                result = await ImportSequenceInserter.import(rawData, mode, activeWorkspaceId, userId);
            }

            // 3. Success Feedback
            console.log("Import berhasil!", result);
            alert("Import berhasil dilakukan!");
            
            return result;

        } catch (error) {
            console.error("Gagal melakukan import:", error);
            alert("Terjadi kesalahan saat mengimpor: " + error.message);
            throw error;
        }
    },

    /**
     * Helper untuk membaca file
     */
    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    },

    /**
     * Helper untuk menginisialisasi event listener di UI
     */
    initUIListeners(callback) {
        const fileInput = document.getElementById('importFile');
        const modeSelect = document.getElementById('importMode');

        if (!fileInput) return;

        fileInput.addEventListener('change', async (e) => {
            if (e.target.files.length === 0) return;

            const file = e.target.files[0];
            const mode = modeSelect ? modeSelect.value : 'collection';
            
            const activeWorkspaceId = window.STATE?.currentWorkspaceId; 
            const userId = window.USER_ID; 

            // Kita tidak perlu mengirim 'native' lagi karena sudah deteksi otomatis di handleImport
            await this.handleImport(file, mode, activeWorkspaceId, userId);
            
            // Reset input agar bisa import file yang sama lagi
            e.target.value = '';
            
            if (callback) callback();
        });
    }
};