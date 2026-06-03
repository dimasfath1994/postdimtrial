// js/ui/body-tabs.js

/**
 * Modul ini menangani perpindahan sub-tab di dalam panel "Body"
 */
export function initBodyTabs(bodyParamCtrl, tabCtrl) {
  const tabs = document.querySelectorAll('.body-tab');
  const bodyModeSelect = document.getElementById('bodyModeSelect');
  
  const boxes = {
    'none': null,
    'raw': document.getElementById('rawBodyBox'),
    'form-data': document.getElementById('formDataBox'),
    'urlencoded': document.getElementById('urlencodedBox')
  };

  // Fungsi sinkronisasi mode (dipanggil saat pindah tab atau load request)
  const handleModeChange = async (mode, isInitial = false) => {
    const activeRequestId = tabCtrl.activeTabId;
    
    if (!activeRequestId) return;

    // 1. Update Visual Dropdown (PENTING: sinkronisasi nilai)
    if (bodyModeSelect) bodyModeSelect.value = mode;

    // 2. Update Visual Tombol (hanya jika elemen ada)
    tabs.forEach(t => t.classList.remove('active'));
    const activeTab = Array.from(tabs).find(t => t.dataset.mode === mode);
    if (activeTab) activeTab.classList.add('active');

    // 3. Sembunyikan semua box konten body
    Object.values(boxes).forEach(box => {
      if (box) box.classList.add('hidden');
    });

    // 4. Tampilkan box yang dipilih
    if (boxes[mode]) {
      boxes[mode].classList.remove('hidden');
    }
    

    // 5. Inisialisasi Data ke Controller
    if (bodyParamCtrl) {
      if (mode === 'raw') {
        const rawEditor = document.getElementById('body');
        const request = tabCtrl.tabs.find(t => t.id === activeRequestId);
        if (rawEditor && request) {
            rawEditor.value = request.body || ''; 
        }
        const selectEl = document.getElementById('bodyModeSelect');
        console.log("RAW TES", selectEl);
        if (selectEl) {
            selectEl.value = mode;
            console.log("DEBUG: Nilai setelah delay:", selectEl.value);
        }
      } else if (mode === 'form-data') {
        const container = document.getElementById('formDataList');
        if (container) await bodyParamCtrl.init(activeRequestId, container, 'formdata');
      } else if (mode === 'urlencoded') {
        const container = document.getElementById('urlencodedList');
        if (container) await bodyParamCtrl.init(activeRequestId, container, 'urlencoded');
      }
    }

    // 6. Trigger event global (hindari loop jika ini adalah initial load)
    if (!isInitial) {
      window.dispatchEvent(new CustomEvent('body-mode-changed', {
        detail: { mode: mode, requestId: activeRequestId }
      }));
    }
  };

  // --- EXPOSE FUNGSI AGAR BISA DIPANGGIL DARI LUAR (SAAT PINDAH TAB) ---
  window.syncBodyModeUI = handleModeChange;

  // Event Listener untuk tombol
  tabs.forEach(tab => {
    tab.addEventListener('click', () => handleModeChange(tab.dataset.mode));
  });

  // Event Listener untuk dropdown
  if (bodyModeSelect) {
    bodyModeSelect.addEventListener('change', (e) => handleModeChange(e.target.value));
  }
}