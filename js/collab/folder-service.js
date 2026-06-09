import { Auth } from "../auth.js";
import { API_BASE_URL } from "../core/api/api-config.js";

const API = `${API_BASE_URL}/folders`; // Prefix sesuai dengan nest di main.rs

export class FolderService {

  static headers() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Auth.getToken()}`
    };
  }

  // ================= GET FOLDERS BY COLLECTION =================
  static async getByCollection(collectionId) {
    const res = await fetch(
      `${API}/collection/${Number(collectionId)}`,
      { headers: this.headers() }
    );

    const text = await res.text();
    if (!res.ok) throw new Error("Failed to fetch folders");

    try {
      return JSON.parse(text);
    } catch {
      return [];
    }
  }

  // ================= CREATE =================
  static async create(workspaceId, collectionId, parentId, name) {
    const payload = {
        workspace_id: Number(workspaceId),
        collection_id: Number(collectionId),
        parent_id: parentId ? Number(parentId) : null,
        name: String(name || "").trim(),
        sort_order: 0
    };

    // DEBUG: Cetak payload agar kita tahu persis apa yang dikirim
    console.log("DEBUG PAYLOAD:", JSON.stringify(payload));

    const res = await fetch(`${API}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(payload)
    });

    const text = await res.text();
    
    // Jika masih 403, kita butuh tahu pesan dari server
    if (!res.ok) {
        console.error("SERVER REJECTED WITH:", res.status, text);
        throw new Error(`[CREATE FOLDER FAILED] ${text}`);
    }

    return JSON.parse(text);
}

  // ================= UPDATE =================
  static async update(id, payload) {
    const res = await fetch(`${API}/${id}`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`[UPDATE FOLDER FAILED] ${text}`);

    return text ? JSON.parse(text) : null;
  }

  // ================= DELETE =================
  static async delete(id) {
    const res = await fetch(`${API}/${id}`, {
      method: "DELETE",
      headers: this.headers()
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`[DELETE FOLDER FAILED] ${errorText}`);
    }

    return true;
  }
}