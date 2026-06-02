// js/ui/tabmanager-ui.js

export const TabManagerUI = {
    init(tabCtrl) { // Terima instance tabCtrl
        const tabs = document.querySelectorAll('.req-tab');
        const panels = document.querySelectorAll('.tab-panel');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                const targetTab = tab.getAttribute('data-tab');
                panels.forEach(panel => {
                    if (panel.getAttribute('data-panel') === targetTab) {
                        panel.classList.remove('hidden');
                        // --- INI KUNCI SINKRONISASI ---
                        tabCtrl.refreshActivePanel(targetTab);
                    } else {
                        panel.classList.add('hidden');
                    }
                });
            });
        });
    }
};