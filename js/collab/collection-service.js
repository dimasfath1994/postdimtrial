import { Auth } from "../auth.js";

import { API_BASE_URL }
from "../core/api/api-config.js";

const API = API_BASE_URL;

export class CollectionService {

  static headers() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Auth.getToken()}`
    };
  }

  // ================= GET =================
  static async getByWorkspace(workspaceId) {

    const id = Number(workspaceId);

    const res = await fetch(
      `${API}/collections?workspace_id=${id}`,
      { headers: this.headers() }
    );

    const text = await res.text();

    console.log("[GET COLLECTIONS RAW]", text);

    if (!res.ok) {
      throw new Error("Failed to fetch collections");
    }

    try {
      return JSON.parse(text);
    } catch {
      return [];
    }
  }

  // ================= CREATE (FIXED i64) =================
  static async create(workspaceId, name) {

    const payload = {
      workspace_id: Number(workspaceId), // 🔥 FIX IMPORTANT (i64 fix)
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

    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  // ================= UPDATE =================
  static async update(id, payload) {

    const res = await fetch(`${API}/collections/${id}`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify(payload)
    });

    const text = await res.text();

    if (!res.ok) {
      throw new Error(`[UPDATE COLLECTION FAILED] ${text}`);
    }

    return text ? JSON.parse(text) : null;
  }

  // ================= DELETE =================
  static async remove(id) {

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