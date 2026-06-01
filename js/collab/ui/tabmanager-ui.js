// js/ui/tabmanager-ui.js

export const TabManagerUI = {
    /**
     * @param {Function} onTabSwitch - Callback yang menerima targetTab dan requestId
     */
    init(onTabSwitch) {
        const tabs = document.querySelectorAll('.req-tab');
        const panels = document.querySelectorAll('.tab-panel');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // 1. Update active tab styling
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // 2. Tampilkan panel yang sesuai
                const targetTab = tab.getAttribute('data-tab');
                panels.forEach(panel => {
                    if (panel.getAttribute('data-panel') === targetTab) {
                        panel.classList.remove('hidden');
                    } else {
                        panel.classList.add('hidden');
                    }
                });

                // 3. Panggil callback untuk sinkronisasi data live
                if (onTabSwitch) {
                    onTabSwitch(targetTab);
                }
            });
        });
    }
};