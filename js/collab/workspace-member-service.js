import { Auth } from "../auth.js";
import { API_BASE_URL } from "../core/api/api-config.js";

const API = API_BASE_URL;

export class WorkspaceMemberService {
  
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
    if (Array.isArray(res?.members)) return res.members;
    if (Array.isArray(res?.result)) return res.result;
    return [];
  }

  // ================= ADD MEMBER =================
  // Rute: POST /
  static async addMember(workspaceId, userId, role = 'viewer') {
    const res = await fetch(`${API}/members`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ 
        workspace_id: Number(workspaceId), 
        user_id: Number(userId), 
        role 
      })
    });

    return res.ok;
  }

  // ================= GET MEMBERS =================
  // Rute: GET /list/{workspace_id}
  static async getMembers(workspaceId) {
    const res = await fetch(`${API}/members/list/${workspaceId}`, {
      headers: this.headers()
    });

    const json = await this.safeJson(res);
    return this.normalizeList(json);
  }

  // ================= UPDATE MEMBER =================
  // Rute: PUT /manage/{member_id}
  static async updateMember(memberId, workspaceId, userId, role, invitedBy = null) {
    const res = await fetch(`${API}/members/manage/${memberId}`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify({ 
        workspace_id: Number(workspaceId),
        user_id: Number(userId),
        role, 
        invited_by: invitedBy 
      })
    });

    return res.ok;
  }

  // ================= REMOVE MEMBER =================
  // Rute: DELETE /manage/{member_id}
  static async removeMember(memberId) {
    const res = await fetch(`${API}/members/manage/${memberId}`, {
      method: "DELETE",
      headers: this.headers()
    });

    if (!res.ok) {
      throw new Error("Failed to remove member");
    }
    return true;
  }
}