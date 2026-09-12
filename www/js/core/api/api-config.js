const DEFAULT_API_URL = "https://deaths-markers-man-implications.trycloudflare.com/api";
const DEFAULT_WS_URL = "wss://deaths-markers-man-implications.trycloudflare.com/api";

let _apiBaseUrl = DEFAULT_API_URL;
let _wsBaseUrl = DEFAULT_WS_URL;

// Simpan Promise inisialisasi agar bisa ditunggu jika diperlukan
let isConfigLoaded = false;
const configPromise = (async () => {
  if (window.postdimBridge && window.postdimBridge.invoke) {
    try {
      const config = await window.postdimBridge.invoke("get_config");
      if (config?.apiBaseUrl) _apiBaseUrl = config.apiBaseUrl;
      if (config?.wsBaseUrl) _wsBaseUrl = config.wsBaseUrl;
    } catch (err) {
      console.error("[api-config] Gagal mengambil konfigurasi VS Code:", err);
    }
  }
  isConfigLoaded = true;
  return { API_BASE_URL: _apiBaseUrl, WS_BASE_URL: _wsBaseUrl };
})();

// Jalankan saat file dimuat
configPromise;

// Proxy cerdas: Jika dipanggil sebelum config siap, ia otomatis menunggu Promise-nya selesai
export const API_BASE_URL = new Proxy({}, {
  get(_, prop) {
    if (prop === 'toString' || prop === Symbol.toPrimitive) {
      return () => _apiBaseUrl;
    }
    // Jika ada properti string biasa yang diakses, kembalikan nilai terkini
    return _apiBaseUrl;
  }
});

export const WS_BASE_URL = new Proxy({}, {
  get(_, prop) {
    if (prop === 'toString' || prop === Symbol.toPrimitive) {
      return () => _wsBaseUrl;
    }
    return _wsBaseUrl;
  }
});