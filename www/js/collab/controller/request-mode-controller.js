// js/controller/request-mode-controller.js

export class RequestModeController {
    static init() {
        const methodSelect = document.getElementById('method');
        if (!methodSelect) {
            console.warn("[RequestModeController] Dropdown #method tidak ditemukan!");
            return;
        }

        // 1. Berjalan saat user mengubah method secara manual via dropdown
        methodSelect.addEventListener('change', (e) => {
            this.updateInterface(e.target.value);
        });

        // 2. Berjalan saat user berpindah tab request dari sidebar
        // (Perubahan oleh JS tidak memicu native 'change' event)
        window.addEventListener('request-tab-switched', () => {
            // Beri jeda 50ms agar TabController selesai mengubah nilai DOM methodSelect
            setTimeout(() => {
                this.updateInterface(methodSelect.value);
            }, 50);
        });

        // 3. Set kondisi saat pertama kali halaman diload
        this.updateInterface(methodSelect.value);
    }

    static updateInterface(method) {
        // Pastikan ID ini sama persis dengan yang ada di index.html / collaboration.html Anda
        const reqTabs = document.getElementById('reqTabs');
        const grpcReqTabs = document.getElementById('grpcReqTabs');
        const reqContent = document.getElementById('reqContent');
        const grpcPanelsContainer = document.getElementById('grpcPanelsContainer');

        // Gunakan style.display langsung agar tidak kalah dengan CSS external (seperti display: flex)
        if (method === 'GRPC') {
            if (reqTabs) reqTabs.style.display = 'none';
            if (reqContent) reqContent.style.display = 'none';
            
            if (grpcReqTabs) grpcReqTabs.style.display = 'flex'; // Tab biasanya butuh flex
            if (grpcPanelsContainer) grpcPanelsContainer.style.display = 'block';
        } else {
            // Jika Method selain GRPC (GET, POST, dll)
            if (reqTabs) reqTabs.style.display = 'flex'; 
            if (reqContent) reqContent.style.display = 'block';
            
            if (grpcReqTabs) grpcReqTabs.style.display = 'none';
            if (grpcPanelsContainer) grpcPanelsContainer.style.display = 'none';
        }
    }
}