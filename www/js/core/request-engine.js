import { EnvResolver } from "./env-resolver.js";
import { AuthStore } from "../collab/auth-store.js";
import { proxysendRequest } from "./api/proxy-api.js";

export class RequestEngine {
  static cookieJar = {};

  static storeCookies(setCookieHeaders) {
    if (!setCookieHeaders) return;
    const cookies = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    for (const cookie of cookies) {
      if (typeof cookie !== "string") continue;
      const [main] = cookie.split(";");
      const idx = main.indexOf("=");
      if (idx === -1) continue;
      const key = main.slice(0, idx).trim();
      const value = main.slice(idx + 1).trim();
      if (!key) continue;
      this.cookieJar[key] = value;
    }
  }

  static async send({ method, url, body, headers = {}, bodyType = "json" }) {
    url = EnvResolver.resolve(url);
    let finalBody;
    let finalHeaders = { ...headers };

    // ================= BODY HANDLING =================
    if (bodyType === "raw" || bodyType === "json") {
      finalHeaders["Content-Type"] = finalHeaders["Content-Type"] || "application/json";
      finalBody = typeof body === "string" ? body : body ? JSON.stringify(body) : undefined;
    } 
    else if (bodyType === "form-data") {
      // Siapkan data untuk Web (FormData) dan Tauri (Array of objects)
      const formData = new FormData();
      const multipartForTauri = [];

      if (body && typeof body === "object") {
        Object.entries(body).forEach(([key, item]) => {
          if (!key) return;
          if (item && typeof item === "object" && "value" in item) {
            if (item.enabled === false) return;
            
            const val = item.file || item.value || "";
            // Web: append ke FormData
            formData.append(key, val);
            // Tauri: simpan ke array untuk dikirim sebagai JSON
            multipartForTauri.push({ key, value: String(val), type: item.type || "text" });
          } else {
            formData.append(key, item ?? "");
            multipartForTauri.push({ key, value: String(item ?? ""), type: "text" });
          }
        });
      }
      
      finalBody = { formData, multipartForTauri };
      delete finalHeaders["Content-Type"];
    } 
    else if (bodyType === "urlencoded") {
      const params = new URLSearchParams();
      if (body && typeof body === "object") {
        Object.entries(body).forEach(([key, item]) => {
          if (!key) return;
          if (item && typeof item === "object" && "value" in item) {
            if (item.enabled === false) return;
            params.append(key, item.value ?? "");
          } else {
            params.append(key, item ?? "");
          }
        });
      }
      finalBody = params;
      finalHeaders["Content-Type"] = finalHeaders["Content-Type"] || "application/x-www-form-urlencoded";
    }

    // ================= AUTH INJECTION =================
    const token = AuthStore?.getToken?.();
    if (token) finalHeaders["Authorization"] = `Bearer ${token}`;

    // ================= TAURI ENGINE =================
    if (window.__TAURI_INTERNALS__ !== undefined) {
      const { invoke } = window.__TAURI__.core;
      
      let tauriBody = null;
      if (bodyType === "form-data") {
        tauriBody = finalBody.multipartForTauri; // Kirim array untuk diproses Rust
      } else {
        tauriBody = typeof finalBody === 'object' ? JSON.stringify(finalBody) : finalBody;
      }

      const res = await invoke('http_request', {
        method,
        url,
        headers: Object.entries(finalHeaders),
        body: tauriBody
      });

      return {
        status: res.status,
        data: res.body,
        headers: Object.fromEntries(res.headers),
        cookies: []
      };
    }

    // ================= WEB FETCH ENGINE =================
    const useProxy = document.getElementById("use-proxy")?.checked;
    const bodyForFetch = ["GET", "HEAD"].includes(method.toUpperCase()) 
      ? undefined 
      : (bodyType === "form-data" ? finalBody.formData : finalBody);

    const options = { method, headers: finalHeaders, body: bodyForFetch };
    const res = useProxy ? await proxysendRequest(url, options, true) : await fetch(url, options);
    
    const rawHeaders = Object.fromEntries(res.headers.entries());
    const rawSetCookie = res.headers.get("set-cookie") || res.headers.get("Set-Cookie");
    RequestEngine.storeCookies(rawSetCookie ? (Array.isArray(rawSetCookie) ? rawSetCookie : [rawSetCookie]) : []);

    const type = res.headers.get("content-type") || "";
    const data = type.includes("application/json") ? await res.json() : await res.text();

    return {
      status: res.status,
      data,
      headers: { ...rawHeaders, "cookie-jar": Object.entries(RequestEngine.cookieJar).map(([k, v]) => `${k}=${v}`).join("; ") },
      cookies: rawSetCookie ? [rawSetCookie] : []
    };
  }
}