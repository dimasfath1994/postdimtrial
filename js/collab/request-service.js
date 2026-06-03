import { Auth } from "../auth.js";
import { API_BASE_URL } from "../core/api/api-config.js";

const API = API_BASE_URL;

export class RequestService {

  static headers() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Auth.getToken()}`
    };
  }

  // ================= GET (BY COLLECTION & FOLDER) =================
  // Menggunakan Query Parameter sesuai dengan rute Rust kita
  static async getByCollection(collectionId, folderId = null) {
    const cId = Number(collectionId);
    let url = `${API}/requests?collection_id=${cId}`;
    
    if (folderId) {
      url += `&folder_id=${Number(folderId)}`;
    }

    const res = await fetch(url, { headers: this.headers() });
    const text = await res.text();

    //console.log("[GET REQUESTS RAW]", text);

    if (!res.ok) {
      throw new Error("Failed to fetch requests");
    }

    try {
      return JSON.parse(text);
    } catch {
      return [];
    }
  }

  // ================= CREATE =================
  static async create(payload) {
    // payload harus berisi: workspace_id, collection_id, folder_id(opsional), name, dll
    const cleanPayload = {
      workspace_id: Number(payload.workspace_id),
      collection_id: Number(payload.collection_id),
      folder_id: payload.folder_id ? Number(payload.folder_id) : null,
      name: payload.name || "New Request",
      method: payload.method || "GET",
      url: payload.url || "",
      body: payload.body || null,
      body_mode: payload.body_mode || "none",
      pinned: payload.pinned || 0,
      auth_type: payload.auth_type || null,
      auth_value: payload.auth_value || null,
      pre_script: payload.pre_script || null,
      post_script: payload.post_script || null,
      sort_order: payload.sort_order || 0
    };

    console.log("[CREATE REQUEST PAYLOAD]", cleanPayload);

    const res = await fetch(`${API}/requests`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(cleanPayload)
    });

    const text = await res.text();

    if (!res.ok) {
      throw new Error(`[CREATE REQUEST FAILED] ${text}`);
    }

    return text ? JSON.parse(text) : null;
  }

  // ================= UPDATE =================
  static async update(id, payload) {
    // Payload untuk update mencakup folder_id baru jika ingin dipindah
    const res = await fetch(`${API}/requests/${id}`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify(payload)
    });

    const text = await res.text();

    if (!res.ok) {
      throw new Error(`[UPDATE REQUEST FAILED] ${text}`);
    }

    return text ? JSON.parse(text) : null;
  }

  // ================= DELETE =================
  static async delete(id) {
    const res = await fetch(`${API}/requests/${id}`, {
      method: "DELETE",
      headers: this.headers()
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`[DELETE REQUEST FAILED] ${text}`);
    }

    return true;
  }
}