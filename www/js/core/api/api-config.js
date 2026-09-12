const DEFAULT_API_URL = "https://deaths-markers-man-implications.trycloudflare.com/api";
const DEFAULT_WS_URL = "wss://deaths-markers-man-implications.trycloudflare.com/api";

// 1. Gunakan 'export let' (bukan const) agar nilainya dapat diubah secara dinamis
export let API_BASE_URL = DEFAULT_API_URL;
export let WS_BASE_URL = DEFAULT_WS_URL;

// 2. Ambil konfigurasi dari VS Code Bridge dan perbarui variabel
export async function loadApiConfig() {
  if (window.postdimBridge && window.postdimBridge.invoke) {
    try {
      const config = await window.postdimBridge.invoke("get_config");
      if (config?.apiBaseUrl) API_BASE_URL = config.apiBaseUrl;
      if (config?.wsBaseUrl) WS_BASE_URL = config.wsBaseUrl;
    } catch (err) {
      console.error("[api-config] Gagal mengambil konfigurasi VS Code:", err);
    }
  }
  return { API_BASE_URL, WS_BASE_URL };
}

// 3. Jalankan pembaruan otomatis saat file dimuat
loadApiConfig();