import { Auth } from "../auth.js";
import { API_BASE_URL } from "../core/api/api-config.js";

const API = API_BASE_URL;

export class UserService {
  
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
    if (Array.isArray(res?.users)) return res.users;
    if (Array.isArray(res?.result)) return res.result;
    return [];
  }

  // ================= SEARCH USERS =================
  static async searchUsers(email) {
    if (!email || email.length < 3) return [];

    const res = await fetch(`${API}/user/users/search?email=${encodeURIComponent(email)}`, {
      headers: this.headers()
    });

    const json = await this.safeJson(res);
    return this.normalizeList(json);
  }

  // ================= GET CURRENT USER =================
  static async getMe() {
    const res = await fetch(`${API}/user/me`, {
      headers: this.headers()
    });

    const json = await this.safeJson(res);
    return json?.data ?? json;
  }
}