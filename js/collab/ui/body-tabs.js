/**
 * js/ui/body-tabs.js
 * Modul ini menangani perpindahan sub-tab di dalam panel "Body"
 */
export function initBodyTabs(bodyParamCtrl, tabCtrl) {

  // Helper untuk mengambil elemen live dari DOM setiap kali dibutuhkan
  const getElements = () => ({
    tabs: document.querySelectorAll('.body-tab'),
    bodyModeSelect: document.getElementById('bodyModeSelect'),
    boxes: {
      'none': document.getElementById('noneBodyBox'), // Asumsi jika ada box 'none'
      'raw': document.getElementById('rawBodyBox'),
      'form-data': document.getElementById('formDataBox'),
      'urlencoded': document.getElementById('urlencodedBox')
    }
  });

  // Normalisasi agar sinkron dengan database (mengutamakan 'form-data')
  const normalizeMode = (mode) => {
    if (mode === 'formdata' || mode === 'form-data') return 'form-data';
    if (!mode || mode === 'null' || mode === 'none') return 'none';
    return mode;
  };

  const handleModeChange = async (mode, isInitial = false) => {
    const activeRequestId = tabCtrl.activeTabId;
    if (!activeRequestId) return;

    const normalizedMode = normalizeMode(mode);
    const { tabs, bodyModeSelect, boxes } = getElements();

    // 1. Update Visual Dropdown
    if (bodyModeSelect) {
      // Pastikan value dropdown cocok dengan data (form-data)
      bodyModeSelect.value = normalizedMode;
    }

    // 2. Update Visual Tombol (Sub-tab)
    tabs.forEach(t => t.classList.remove('active'));
    const activeTab = Array.from(tabs).find(t => t.dataset.mode === normalizedMode);
    if (activeTab) activeTab.classList.add('active');

    // 3. Sembunyikan semua box (menggunakan selector live)
    Object.values(boxes).forEach(box => { 
      if (box) box.classList.add('hidden'); 
    });

    // 4. Tampilkan box yang dipilih
    if (boxes[normalizedMode]) {
      boxes[normalizedMode].classList.remove('hidden');
    }

    // 5. Inisialisasi Data ke Controller (menggunakan rAF agar DOM ready)
    if (bodyParamCtrl) {
      requestAnimationFrame(async () => {
        if (normalizedMode === 'raw') {
          const rawEditor = document.getElementById('body');
          const request = tabCtrl.tabs.find(t => t.id === activeRequestId);
          console.log("DARI BODY TABS", request);
          if (rawEditor && request && !String(activeRequestId).startsWith('draft_')) rawEditor.value = request.body || ''; 
        } else if (normalizedMode === 'form-data') {
          const container = document.getElementById('formDataList');
          if (container) await bodyParamCtrl.init(activeRequestId, container, 'formdata');
        } else if (normalizedMode === 'urlencoded') {
          const container = document.getElementById('urlencodedList');
          if (container) await bodyParamCtrl.init(activeRequestId, container, 'urlencoded');
        }
      });
    }

    // 6. Trigger event global untuk keperluan sinkronisasi lain
    if (!isInitial) {
      window.dispatchEvent(new CustomEvent('body-mode-changed', {
        detail: { mode: normalizedMode, requestId: activeRequestId }
      }));
    }
  };

  // Expose ke window
  window.syncBodyModeUI = handleModeChange;

  // Event Listeners dengan sistem re-attach
  const attachListeners = () => {
    const { tabs, bodyModeSelect } = getElements();
    tabs.forEach(tab => {
      tab.onclick = () => handleModeChange(tab.dataset.mode);
    });
    if (bodyModeSelect) {
      bodyModeSelect.onchange = (e) => handleModeChange(e.target.value);
    }
  };

  attachListeners();
  
  // Jika panel di-render ulang oleh loadToEditor, panggil ini:
  window.addEventListener('panel-rendered', attachListeners);
}