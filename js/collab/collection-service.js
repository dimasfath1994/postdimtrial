import { Auth } from "../auth.js";

const API = "https://skilled-fundamental-acquired-express.trycloudflare.com/api";

export class CollectionService {

  // ================= HEADERS =================
  static headers() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Auth.getToken()}`
    };
  }

  // ================= GET BY WORKSPACE =================
  static async getByWorkspace(workspaceId) {

    const res = await fetch(
      `${API}/collections?workspace_id=${workspaceId}`,
      {
        headers: this.headers()
      }
    );

    const text = await res.text();

    console.log("[GET COLLECTIONS RAW]", text);

    if (!res.ok) {
      throw new Error("Failed to fetch collections");
    }

    return text ? JSON.parse(text) : [];
  }

  // ================= CREATE =================
  static async create(workspaceId, name) {

    const payload = {
      workspace_id: String(workspaceId), // FIX: safe type
      name: String(name || "").trim()
    };

    console.log("[CREATE COLLECTION PAYLOAD]", payload);

    const res = await fetch(`${API}/collections`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload)
    });

    const text = await res.text();

    console.log("[CREATE COLLECTION RAW RESPONSE]", text);

    if (!res.ok) {
      throw new Error(`[CREATE COLLECTION FAILED] ${text}`);
    }

    return text ? JSON.parse(text) : null;
  }

  // ================= UPDATE =================
  static async update(id, payload) {

    const safePayload = {
      ...payload
    };

    console.log("[UPDATE COLLECTION]", id, safePayload);

    const res = await fetch(`${API}/collections/${id}`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify(safePayload)
    });

    const text = await res.text();

    if (!res.ok) {
      throw new Error(`[UPDATE COLLECTION FAILED] ${text}`);
    }

    return text ? JSON.parse(text) : null;
  }

  // ================= DELETE =================
  static async remove(id) {

    console.log("[DELETE COLLECTION]", id);

    const res = await fetch(`${API}/collections/${id}`, {
      method: "DELETE",
      headers: this.headers()
    });

    const text = await res.text();

    if (!res.ok) {
      throw new Error(`[DELETE COLLECTION FAILED] ${text}`);
    }

    return true;
  }
}