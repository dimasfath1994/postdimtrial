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

        document.querySelectorAll('#grpcReqTabs .req-tab[data-grpc-tab]').forEach((tab) => {
            tab.addEventListener('click', () => this.showGrpcTab(tab));
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
        const grpcPanelsContainer = document.getElementById('grpcPanelsContainer');
        const normalPanels = document.querySelectorAll('#reqContent > .tab-panel');
        const grpcTabs = document.getElementById('grpcReqTabs');

        // Gunakan style.display langsung agar tidak kalah dengan CSS external (seperti display: flex)
        if (method === 'GRPC') {
            if (reqTabs) {
                reqTabs.classList.add('hidden');
                reqTabs.style.display = 'none';
            }
            normalPanels.forEach(panel => {
                panel.classList.add('hidden');
                panel.style.display = 'none';
            });
            
            if (grpcTabs) {
                grpcTabs.classList.remove('hidden');
                grpcTabs.style.display = 'flex';
            }
            if (grpcPanelsContainer) {
                grpcPanelsContainer.classList.remove('hidden');
                grpcPanelsContainer.style.display = 'block';
            }

            const activeGrpcTab = document.querySelector('#grpcReqTabs .req-tab.active')
                || document.querySelector('#grpcReqTabs .req-tab[data-grpc-tab="message"]');
            if (activeGrpcTab) this.showGrpcTab(activeGrpcTab);
        } else {
            // Jika Method selain GRPC (GET, POST, dll)
            if (reqTabs) {
                reqTabs.classList.remove('hidden');
                reqTabs.style.display = 'flex';
            }
            
            if (grpcTabs) {
                grpcTabs.classList.add('hidden');
                grpcTabs.style.display = 'none';
            }
            if (grpcPanelsContainer) {
                grpcPanelsContainer.classList.add('hidden');
                grpcPanelsContainer.style.display = 'none';
            }

            normalPanels.forEach(panel => {
                panel.style.display = '';
                panel.classList.add('hidden');
            });

            const activeNormalTab = document.querySelector('#reqTabs .req-tab.active')
                || document.querySelector('#reqTabs .req-tab[data-tab="params"]');
            const activePanel = activeNormalTab
                ? document.querySelector(`#reqContent > .tab-panel[data-panel="${activeNormalTab.dataset.tab}"]`)
                : null;
            activePanel?.classList.remove('hidden');
        }
    }

    static showGrpcTab(tab) {
        const grpcPanelsContainer = document.getElementById('grpcPanelsContainer');
        const sharedPanelName = tab.dataset.sharedPanel;
        const target = tab.dataset.grpcTab;

        document.querySelectorAll('#grpcReqTabs .req-tab').forEach(item => item.classList.remove('active'));
        tab.classList.add('active');

        document.querySelectorAll('#reqContent > .tab-panel').forEach(panel => {
            panel.classList.add('hidden');
            panel.style.display = 'none';
        });
        document.querySelectorAll('.grpc-tab-panel').forEach(panel => {
            panel.style.display = 'none';
        });

        if (sharedPanelName) {
            if (grpcPanelsContainer) grpcPanelsContainer.style.display = 'none';
            const sharedPanel = document.querySelector(`#reqContent > .tab-panel[data-panel="${sharedPanelName}"]`);
            sharedPanel?.classList.remove('hidden');
            if (sharedPanel) sharedPanel.style.display = 'block';
            return;
        }

        if (grpcPanelsContainer) grpcPanelsContainer.style.display = 'block';
        const grpcPanel = document.querySelector(`.grpc-tab-panel[data-grpc-panel="${target}"]`);
        if (grpcPanel) grpcPanel.style.display = 'block';
        if (target === 'message') {
            requestAnimationFrame(() => document.getElementById('grpcMessageEditor')?.__grpcEditor?.layout());
        }
    }
}