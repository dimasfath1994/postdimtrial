import { AuthStore } from "./auth-store.js";

import { API_BASE_URL }
from "../core/api/api-config.js";

const API = API_BASE_URL;

export class WorkspaceAPI {

  static async list() {

    const res = await fetch(API + "/workspaces", {
      headers: {
        "Authorization": "Bearer " + AuthStore.getToken()
      }
    });

    if (!res.ok) throw new Error("Failed to load workspace");

    return res.json();
  }
}