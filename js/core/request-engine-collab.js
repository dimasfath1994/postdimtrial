import { EnvResolver } from "./env-resolver.js";
import { AuthStore } from "../collab/auth-store.js";

export class RequestEngine {


// =====================================================
// REQUEST ENGINE NOTES
// =====================================================
//
// POSTDIM berjalan di browser (Fetch API),
// bukan desktop runtime seperti Postman / Insomnia.
//
// Karena itu ada beberapa keterbatasan:
//
// -----------------------------------------------------
// COOKIES
// -----------------------------------------------------
//
// Browser tidak memberi akses penuh ke HTTP cookies.
//
// Contoh:
//
// Set-Cookie: session=abc123; HttpOnly
//
// Limitasi:
//
// - Header "Set-Cookie" sering tidak bisa dibaca
//   karena CORS / Fetch restriction.
//
// - Cookie HttpOnly tidak dapat diakses JS.
//
// - Browser tetap mengelola cookie real sendiri.
//
// Maka cookieJar digunakan sebagai
// Postman-like in-memory cookie persistence.
//
// Flow:
//
// Response
//   Set-Cookie -> storeCookies()
//
// Request berikutnya
//   cookieJar -> Cookie header
//
// Contoh:
//
// login response:
//
// Set-Cookie:
// session=abc123
//
// next request:
//
// Cookie:
// session=abc123
//
// NOTE:
//
// Ini hanya simulasi persistence.
// Bukan pengganti browser cookie system.
//
// Attribute berikut belum diproses:
//
// - Path
// - Domain
// - Secure
// - SameSite
// - HttpOnly
//
// -----------------------------------------------------
// HEADERS
// -----------------------------------------------------
//
// Response headers dinormalisasi:
//
// const rawHeaders =
// Object.fromEntries(res.headers.entries())
//
// Tambahan pseudo header:
//
// cookie-jar
//
// digunakan hanya untuk UI response viewer
// agar perilaku mirip Postman.
//
// Contoh:
//
// headers: {
//   "content-type": "...",
//   "cookie-jar": "session=abc123"
// }
//
// -----------------------------------------------------
// FETCH
// -----------------------------------------------------
//
// Request flow:
//
// 1. Resolve env vars
// 2. Build body
// 3. Inject auth
// 4. Inject cookies
// 5. Fetch request
// 6. Store cookies
// 7. Return response
//
// Browser Fetch != Postman Desktop.
//
// Browser tetap dibatasi:
//
// - CORS
// - credentials policy
// - cookie policy
// - HttpOnly restriction
//
// =====================================================

  static cookieJar = {};
  static storeCookies(setCookieHeaders) {
  if (!setCookieHeaders) return;

  const cookies = Array.isArray(setCookieHeaders)
    ? setCookieHeaders
    : [setCookieHeaders];

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

    // ================= JSON =================
    if (
  bodyType === "raw" ||
  bodyType === "json"
) {

  finalHeaders["Content-Type"] =
    finalHeaders["Content-Type"] ||
    "application/json";

  finalBody =
    typeof body === "string"
      ? body
      : body
        ? JSON.stringify(body)
        : undefined;

  console.log(
    "RAW BODY",
    finalBody
  );
}

    // ================= FORM DATA =================
    else if (bodyType === "form-data") {

      const formData = new FormData();

      if (body && typeof body === "object") {

        Object.entries(body).forEach(([key, item]) => {

          if (!key) return;

          // object format
          if (item && typeof item === "object" && "value" in item) {

            // disabled => skip total
            if (item.enabled === false) return;

            // FILE HANDLING
            if (item.type === "file") {

              const file = item.file || item.value;

              if (file) {
                formData.append(key, file);
              } else {
                // tetap kirim empty string kalau enabled tapi kosong
                formData.append(key, "");
              }

              return;
            }

            // TEXT VALUE
            const val =
              item.value === undefined || item.value === null
                ? ""
                : String(item.value);

            formData.append(key, val);
            return;
          }

          // fallback plain value
          formData.append(key, item ?? "");
        });
      }

      finalBody = formData;

      delete finalHeaders["Content-Type"];
    }

    // ================= URLENCODED =================
    else if (bodyType === "urlencoded") {

      const params = new URLSearchParams();

      if (body && typeof body === "object") {

        Object.entries(body).forEach(([key, item]) => {

          if (!key) return;

          if (item && typeof item === "object" && "value" in item) {

            if (item.enabled === false) return;

            const val =
              item.value === undefined || item.value === null
                ? ""
                : String(item.value);

            params.append(key, val);
            return;
          }

          params.append(key, item ?? "");
        });
      }

      finalBody = params;

      finalHeaders["Content-Type"] =
        finalHeaders["Content-Type"] || "application/x-www-form-urlencoded";
    }

    // ================= AUTH INJECTION (COLLAB MODE ONLY) =================
    const token = AuthStore?.getToken?.();
    if (token) {
      finalHeaders["Authorization"] = `Bearer ${token}`;
    }


    // ================= FETCH PREPARATION =================

const cookieHeader = Object.entries(RequestEngine.cookieJar)
  .map(([k, v]) => `${k}=${v}`)
  .join("; ");

if (cookieHeader) {
  if (!finalHeaders["Cookie"] && cookieHeader) {
  finalHeaders["Cookie"] = cookieHeader;
}
}
    // ================= FETCH =================


    const res = await fetch(url, {
      method,
      headers: finalHeaders,
      body: ["GET", "HEAD"].includes(method) ? undefined : finalBody,
      //credentials: "include"
    });

    const rawHeaders = Object.fromEntries(res.headers.entries());

  

  const rawSetCookie =
  res.headers.get("set-cookie") ||
  res.headers.get("Set-Cookie");

const cookies = rawSetCookie
  ? Array.isArray(rawSetCookie)
    ? rawSetCookie
    : [rawSetCookie]
  : [];

RequestEngine.storeCookies(cookies);

const cookieJarString = Object.entries(RequestEngine.cookieJar)
  .map(([k, v]) => `${k}=${v}`)
  .join("; ");


    const type = res.headers.get("content-type") || "";

    let data;

    if (type.includes("application/json")) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    return {
    status: res.status,
    data,

    headers: {
      ...rawHeaders,

      // pseudo header biar mirip Postman
      "cookie-jar": cookieJarString  || null
    },

    cookies
    };


  }
}