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

  static async send({ method = "POST", url, body, headers = {}, bodyType = "json", grpcOptions = {} }) {
    url = EnvResolver.resolve(url);
    let finalBody;
    let finalHeaders = { ...headers };

    // ================= 1. gRPC HANDLING (KHUSUS PROTOBUF/HTTP2) =================
    if (bodyType === "grpc") {
      const token = AuthStore?.getToken?.();
      if (token) finalHeaders["Authorization"] = `Bearer ${token}`;

      // Resolusi Service & Method dari grpcOptions, body, atau DOM (#grpcServiceMethod)
      let service = grpcOptions.service || body?.service || "";
      let grpcMethod = grpcOptions.method || body?.method || "";

      if (!service || !grpcMethod) {
        const smInput = document.getElementById("grpcServiceMethod")?.value || "";
        if (smInput) {
          if (smInput.includes("/")) {
            const parts = smInput.split("/");
            service = service || parts[0].trim();
            grpcMethod = grpcMethod || parts[1].trim();
          } else if (smInput.includes(".")) {
            const lastDot = smInput.lastIndexOf(".");
            service = service || smInput.slice(0, lastDot).trim();
            grpcMethod = grpcMethod || smInput.slice(lastDot + 1).trim();
          } else {
            service = service || smInput.trim();
          }
        }
      }

      // Resolusi Data Payload dari body atau DOM (#grpcBody)
      let grpcData = {};
      if (body && typeof body === "object" && body.data !== undefined) {
        grpcData = body.data;
      } else if (body && typeof body === "object" && !body.service && !body.method) {
        grpcData = body;
      } else if (typeof body === "string" && body.trim()) {
        try {
          grpcData = JSON.parse(body);
        } catch (e) {
          grpcData = body;
        }
      } else {
        const domGrpcBody = document.getElementById("grpcBody")?.value || "";
        if (domGrpcBody.trim()) {
          try {
            grpcData = JSON.parse(domGrpcBody);
          } catch (e) {
            grpcData = domGrpcBody;
          }
        }
      }

      // A. Jika di lingkungan TAURI (Desktop Native gRPC)
      if (window.__TAURI_INTERNALS__ !== undefined) {
        const invoke = window.__TAURI__?.invoke || 
                       window.__TAURI__?.core?.invoke || 
                       window.__TAURI_INTERNALS__?.invoke || 
                       window.__TAURI_INTERNALS__?.core?.invoke;

        const res = await invoke("grpc_request", {
          url,
          service,
          method: grpcMethod,
          metadata: Object.entries(finalHeaders),
          data: typeof grpcData === "string" ? JSON.parse(grpcData || "{}") : (grpcData || {})
        });

        return {
          status: res.status || 200,
          data: res.data,
          headers: res.headers || {},
          cookies: []
        };
      }

      // B. Jika di BROWSER (Dialihkan ke Backend Proxy/gRPC-Web Proxy)
      const options = {
        method: "POST",
        headers: { ...finalHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: url,
          service,
          method: grpcMethod,
          data: typeof grpcData === "string" ? JSON.parse(grpcData || "{}") : (grpcData || {})
        })
      };

      const useProxy = document.getElementById("use-proxy")?.checked;
      const proxyUrl = url.endsWith("/grpc-proxy") ? url : `${url.replace(/\/+$/, "")}/grpc-proxy`;

      const res = useProxy ? await proxysendRequest(proxyUrl, options, true) : await fetch(proxyUrl, options);
      
      let data;
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        try {
          data = await res.json();
        } catch (e) {
          data = await res.text();
        }
      } else {
        data = await res.text();
      }

      return { 
        status: res.status, 
        data, 
        headers: Object.fromEntries(res.headers.entries()), 
        cookies: [] 
      };
    }

    // ================= 2. GRAPHQL HANDLING =================
    if (bodyType === "graphql") {
      finalHeaders["Content-Type"] = finalHeaders["Content-Type"] || "application/json";

      let query = "";
      let variables = {};

      if (typeof body === "string") {
        query = body;
      } else if (body && typeof body === "object") {
        query = body.query || "";
        variables = body.variables || {};
      }

      // Fallback ke DOM jika query / variables tidak terisi dari argumen `body`
      if (!query) {
        query = document.getElementById("graphqlQuery")?.value || "";
      }

      if (typeof variables === "string") {
        try {
          variables = JSON.parse(variables || "{}");
        } catch (e) {
          variables = {};
        }
      } else if (Object.keys(variables).length === 0) {
        const domVars = document.getElementById("graphqlVariables")?.value || "";
        if (domVars.trim()) {
          try {
            variables = JSON.parse(domVars);
          } catch (e) {
            variables = domVars;
          }
        }
      }

      const payload = {
        query,
        variables
      };

      finalBody = JSON.stringify(payload);
    } 
    // ================= 3. HTTP standard HANDLING (FLOW LAMA UTUH) =================
    else if (bodyType === "raw" || bodyType === "json") {
      finalHeaders["Content-Type"] = finalHeaders["Content-Type"] || "application/json";
      finalBody = typeof body === "string" ? body : body ? JSON.stringify(body) : undefined;
    } 
    else if (bodyType === "form-data") {
      const formData = new FormData();
      const multipartForTauri = [];

      if (body && typeof body === "object") {
        Object.entries(body).forEach(([key, item]) => {
          if (!key) return;
          if (item && typeof item === "object" && "value" in item) {
            if (item.enabled === false) return;
            const val = item.file || item.value || "";
            formData.append(key, val);
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
      const invoke = window.__TAURI__?.invoke || 
                     window.__TAURI__?.core?.invoke || 
                     window.__TAURI_INTERNALS__?.invoke || 
                     window.__TAURI_INTERNALS__?.core?.invoke;
      
      let tauriBody = null;
      if (bodyType === "form-data") {
        tauriBody = finalBody.multipartForTauri;
      } else {
        tauriBody = typeof finalBody === 'object' ? JSON.stringify(finalBody) : finalBody;
      }

      const res = await invoke('http_request', {
        method,
        url,
        headers: Object.entries(finalHeaders),
        body: tauriBody
      });

      const headersMap = Object.fromEntries(res.headers);
      let responseData = res.body;

      const isJson = Object.entries(headersMap).some(
        ([key, val]) => key.toLowerCase() === 'content-type' && val.toLowerCase().includes('application/json')
      );

      if (isJson && responseData) {
        try {
          responseData = JSON.parse(responseData);
        } catch (e) {
          console.warn("[Beautifier] Response diklaim JSON tapi gagal di-parse:", e);
        }
      }

      return {
        status: res.status,
        data: responseData,
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