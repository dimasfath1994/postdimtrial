/**
 * controller/export-controller.js
 * Menangani logika ekspor workspace ke JSON
 */
import { WorkspaceAggregator } from "../services/workspace-aggregator.js";

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
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            
            // Trigger download otomatis
            const a = document.createElement("a");
            a.href = url;
            a.download = `workspace-${workspaceId}-${new Date().getTime()}.json`;
            document.body.appendChild(a); // Append ke body untuk kompatibilitas browser
            a.click();
            
            // Cleanup
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
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