import { Auth } from "../auth.js";

import { API_BASE_URL }
from "../core/api/api-config.js";

const API = API_BASE_URL;

export class Workspace {

  static currentWorkspaceId = null;

  static async join(workspaceId) {

    const token = Auth.getToken();

    const res = await fetch(`${API}/workspace/join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ workspaceId })
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.message);

    this.currentWorkspaceId = workspaceId;

    return data;
  }

  static async create(name) {

    const token = Auth.getToken();

    const res = await fetch(`${API}/workspace/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ name })
    });

    return res.json();
  }

  static async getState() {

    const token = Auth.getToken();

    const res = await fetch(`${API}/workspace/state`, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    return res.json();
  }

  static async pushState(state) {

    const token = Auth.getToken();

    await fetch(`${API}/workspace/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        workspaceId: this.currentWorkspaceId,
        state
      })
    });
  }
}