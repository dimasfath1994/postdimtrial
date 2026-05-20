import { Auth } from "../auth.js";

import { API_BASE_URL }
from "../core/api/api-config.js";

const API = API_BASE_URL;

export class WorkspaceService {

  // ================= HEADERS =================
  static headers() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Auth.getToken()}`
    };
  }

  // ================= SAFE JSON =================
  static async safeJson(res) {
    try {
      return await res.json();
    } catch {
      return {};
    }
  }

  // ================= NORMALIZER =================
  static normalizeList(res) {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data)) return res.data;
    if (Array.isArray(res?.workspaces)) return res.workspaces;
    if (Array.isArray(res?.result)) return res.result;
    return [];
  }

  // ================= EXTRACTOR (IMPORTANT FIX) =================
  static extractWorkspaceId(ws) {
    if (!ws) return null;

    const candidates = [
      ws.id,
      ws.workspace_id,
      ws.activeId,
      ws.data?.activeId,
      ws.data?.id
    ];

    for (const c of candidates) {
      const n = Number(c);
      if (Number.isFinite(n)) return n;
    }

    return null;
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
    window.__workspaceMutation = Date.now();
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
    window.__workspaceMutation = Date.now();
    const safeId = this.extractWorkspaceId({ id });

    if (!safeId) {
      console.error("[WorkspaceService] invalid id:", id);
      return;
    }

    const res = await fetch(`${API}/workspaces/${safeId}`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify(body)
    });

    const json = await this.safeJson(res);

    return json?.data ?? json;
  }

  //=================== DELETE =======================

static async deleteWorkspace(id){
  window.__workspaceMutation = Date.now();
  const res =
    await fetch(
      `${API_BASE_URL}/workspaces/${id}`,
      {
        method:"DELETE",

        headers:
          this.headers()
      }
    );

  if(!res.ok){

    throw new Error(
      await res.text()
    );

  }

}


  // ================= INVITE =================
  static async inviteUser(workspaceId, email) {

    const safeId = this.extractWorkspaceId({ id: workspaceId });

    const res = await fetch(
      `${API}/workspaces/${safeId}/invite`,
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