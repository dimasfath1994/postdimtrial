// js/ui/body-tabs.js

/**
 * Modul ini menangani perpindahan sub-tab di dalam panel "Body"
 */
export function initBodyTabs(bodyParamCtrl, tabCtrl) {
  console.log("masuk ga ke body tab");
  const tabs = document.querySelectorAll('.body-tab');
  const bodyModeSelect = document.getElementById('bodyModeSelect');
  
  const boxes = {
    'none': null,
    'raw': document.getElementById('rawBodyBox'),
    'form-data': document.getElementById('formDataBox'),
    'urlencoded': document.getElementById('urlencodedBox')
  };

  // Fungsi untuk menormalisasi nama mode agar seragam di internal
  const normalizeMode = (mode) => {
    if (mode === 'formdata') return 'form-data';
    return mode;
  };

  const handleModeChange = async (mode, isInitial = false) => {
  
    const activeRequestId = tabCtrl.activeTabId;
    if (!activeRequestId) return;

    // Normalisasi mode yang masuk
    const normalizedMode = normalizeMode(mode);

    // 1. Update Visual Dropdown (gunakan normalized agar cocok dengan value di HTML)
    if (bodyModeSelect) bodyModeSelect.value = normalizedMode;

    // 2. Update Visual Tombol
    tabs.forEach(t => t.classList.remove('active'));
    const activeTab = Array.from(tabs).find(t => t.dataset.mode === normalizedMode);
    if (activeTab) activeTab.classList.add('active');

    // 3. Sembunyikan semua box
    Object.values(boxes).forEach(box => { if (box) box.classList.add('hidden'); });

    // 4. Tampilkan box yang dipilih
    if (boxes[normalizedMode]) {
      boxes[normalizedMode].classList.remove('hidden');
    }

    // 5. Inisialisasi Data ke Controller (Mengirim versi yang diinginkan controller)
    if (bodyParamCtrl) {
      if (normalizedMode === 'raw') {
        const rawEditor = document.getElementById('body');
        const request = tabCtrl.tabs.find(t => t.id === activeRequestId);
        if (rawEditor && request) rawEditor.value = request.body || ''; 
      } else if (normalizedMode === 'form-data') {
        // Controller Anda minta 'formdata' (tanpa strip), kita kirim itu
        await bodyParamCtrl.init(activeRequestId, document.getElementById('formDataList'), 'formdata');
      } else if (normalizedMode === 'urlencoded') {
        await bodyParamCtrl.init(activeRequestId, document.getElementById('urlencodedList'), 'urlencoded');
      }
    }

    // 6. Trigger event global
    if (!isInitial) {
      window.dispatchEvent(new CustomEvent('body-mode-changed', {
        detail: { mode: normalizedMode, requestId: activeRequestId }
      }));
    }
  };

  window.syncBodyModeUI = handleModeChange;

  tabs.forEach(tab => {
    tab.addEventListener('click', () => handleModeChange(tab.dataset.mode));
  });

  if (bodyModeSelect) {
    bodyModeSelect.addEventListener('change', (e) => handleModeChange(e.target.value));
  }
}