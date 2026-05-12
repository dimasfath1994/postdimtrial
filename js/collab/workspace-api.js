import { AuthStore } from "./auth-store.js";

const API = "https://skilled-fundamental-acquired-express.trycloudflare.com/api";

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