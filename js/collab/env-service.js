import { Auth } from "../auth.js";
import { API_BASE_URL } from "../core/api/api-config.js";

const API = API_BASE_URL;

export class EnvService {

  static headers() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Auth.getToken()}`
    };
  }

  // ================= GET BY WORKSPACE =================
  static async getByWorkspace(workspaceId) {
    const res = await fetch(
      `${API}/environments/workspace/${workspaceId}`,
      { headers: this.headers() }
    );

    const text = await res.text();
    if (!res.ok) throw new Error("Failed to fetch environments");

    try {
      return JSON.parse(text);
    } catch {
      return [];
    }
  }

  // ================= CREATE =================
  static async create(workspaceId, key, value) {
    const payload = {
      workspace_id: Number(workspaceId),
      env_key: String(key || "").trim(),
      env_value: String(value || "")
    };

    const res = await fetch(`${API}/environments`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`[CREATE ENV FAILED] ${text}`);

    return JSON.parse(text);
  }

  // ================= UPDATE =================
  static async update(id, payload) {
    const res = await fetch(`${API}/environments/${id}`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`[UPDATE ENV FAILED] ${text}`);

    return JSON.parse(text);
  }

  // ================= DELETE =================
  static async delete(id) {
    const res = await fetch(`${API}/environments/${id}`, {
      method: "DELETE",
      headers: this.headers()
    });

    if (!res.ok) throw new Error(`[DELETE ENV FAILED] ${await res.text()}`);

    return true;
  }
}