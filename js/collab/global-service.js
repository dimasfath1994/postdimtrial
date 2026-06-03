import { Auth } from "../auth.js";
import { API_BASE_URL } from "../core/api/api-config.js";

const API = API_BASE_URL;

export class GlobalService {

  static headers() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Auth.getToken()}`
    };
  }

  // ================= GET ALL =================
  static async getAll() {
    const res = await fetch(
      `${API}/globals`,
      { headers: this.headers() }
    );

    const text = await res.text();
    if (!res.ok) throw new Error("Failed to fetch globals");

    try {
      return JSON.parse(text);
    } catch {
      return [];
    }
  }

  // ================= CREATE =================
  static async create(key, value) {
    const payload = {
      global_key: String(key || "").trim(),
      global_value: String(value || "")
    };

    const res = await fetch(`${API}/globals`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`[CREATE GLOBAL FAILED] ${text}`);

    return JSON.parse(text);
  }

  // ================= UPDATE =================
  static async update(id, payload) {
    const res = await fetch(`${API}/globals/${id}`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`[UPDATE GLOBAL FAILED] ${text}`);

    return JSON.parse(text);
  }

  // ================= DELETE =================
  static async delete(id) {
    const res = await fetch(`${API}/globals/${id}`, {
      method: "DELETE",
      headers: this.headers()
    });

    if (!res.ok) throw new Error(`[DELETE GLOBAL FAILED] ${await res.text()}`);

    return true;
  }
}