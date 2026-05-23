import { API_BASE_URL } from "./api-config.js";

const PROXY_SECRET = "my-super-secret-key-123";

/**
 * Fungsi untuk melakukan request. 
 * Jika useProxy true, maka diarahkan ke backend Rust kita.
 */
export async function proxysendRequest(url, options = {}, useProxy = false) {
  let fetchUrl = url;
  let headers = { ...options.headers };

  if (useProxy) {
    // Arahkan ke endpoint proxy Rust kita
    // URL target asli dikirim sebagai query parameter
    fetchUrl = `${API_BASE_URL}/proxy?url=${encodeURIComponent(url)}`;
    
    // Tambahkan Auth Key untuk backend Rust
    headers["Authorization"] = PROXY_SECRET;
  }

  const response = await fetch(fetchUrl, {
    ...options,
    headers: headers,
  });

  return response;
}