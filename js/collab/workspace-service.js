import { Auth } from "../auth.js";

const API =
  "https://skilled-fundamental-acquired-express.trycloudflare.com/api";

export class WorkspaceService {

  static headers() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Auth.getToken()}`
    };
  }

  // ================= NORMALIZER =================
  static async safeJson(res) {
    const json = await res.json().catch(() => ({}));
    return json;
  }

  static normalizeList(res) {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data)) return res.data;
    if (Array.isArray(res?.workspaces)) return res.workspaces;
    if (Array.isArray(res?.result)) return res.result;
    return [];
  }

  // ================= GET ALL =================
  static async getMyWorkspaces() {

    const res = await fetch(`${API}/workspaces`, {
      headers: this.headers()
    });

    const json = await this.safeJson(res);

    return this.normalizeList(json);
  }

  // ================= GET SINGLE =================
  static async getWorkspace(id) {

    const res = await fetch(`${API}/workspaces/${id}`, {
      headers: this.headers()
    });

    const json = await this.safeJson(res);

    return json?.data ?? json;
  }

  // ================= CREATE =================
  static async createWorkspace(name) {

    const res = await fetch(`${API}/workspaces`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ name })
    });

    const json = await this.safeJson(res);

    return json?.data ?? json;
  }

  // ================= UPDATE =================
  static async updateWorkspace(id, body) {

    const res = await fetch(`${API}/workspaces/${id}`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify(body)
    });

    const json = await this.safeJson(res);

    return json?.data ?? json;
  }

  // ================= INVITE =================
  static async inviteUser(workspaceId, email) {

    const res = await fetch(
      `${API}/workspaces/${workspaceId}/invite`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ email })
      }
    );

    const json = await this.safeJson(res);

    return json?.data ?? json;
  }
}