/**
 * controller/export-controller.js
 * Menangani logika ekspor workspace ke JSON
 */
import { WorkspaceAggregator } from "../services/workspace-aggregator.js";
import { saveJsonFile } from "../../core/file-transfer.js";

document.addEventListener("DOMContentLoaded", () => {
    const exportBtn = document.getElementById("exportBtn");

    if (!exportBtn) {
        console.warn("[ExportController] Elemen exportBtn tidak ditemukan di DOM.");
        return;
    }

    exportBtn.addEventListener("click", async () => {
        // Mengambil workspaceId dari state global yang sudah diekspos
        const workspaceId = window.COLLAB_STATE?.workspaceId;

        if (!workspaceId) {
            alert("Gagal mengekspor: Workspace tidak aktif.");
            return;
        }

        try {
            // UI Feedback saat proses berlangsung
            exportBtn.disabled = true;
            exportBtn.innerText = "Exporting...";

            console.log(`[Export] Memulai pengumpulan data untuk Workspace: ${workspaceId}`);
            
            // Mengambil semua data workspace (Requests, Collections, Env, Globals)
            const data = await WorkspaceAggregator.getFullWorkspaceData(workspaceId);

            // Membuat Blob untuk file JSON
            await saveJsonFile(data, `workspace-${workspaceId}-${Date.now()}.json`);
            
            console.log("[Export] Berhasil mengunduh workspace.");
        } catch (err) {
            console.error("[Export Error]", err);
            alert("Terjadi kesalahan saat mengekspor data: " + err.message);
        } finally {
            // Reset tombol ke keadaan semula
            exportBtn.disabled = false;
            exportBtn.innerText = "Export";
        }
    });
});