import { WorkspaceAPI } from "./workspace-api.js";
import { AuthStore } from "./auth-store.js";

// global event bridge
function emitWorkspaceChange(ws) {
  window.dispatchEvent(
    new CustomEvent("workspace:changed", {
      detail: ws
    })
  );
}

export async function initWorkspaceUI() {

  if (!AuthStore.isLoggedIn()) return;

  const sidebar = document.getElementById("collectionList");
  if (!sidebar) return;

  const existing = document.getElementById("workspaceSection");
  if (existing) existing.remove();

  const wrap = document.createElement("div");
  wrap.id = "workspaceSection";



  sidebar.prepend(wrap);



  // ================= LOAD WORKSPACE =================
  try {

    const data = await WorkspaceAPI.list();
    const list = wrap.querySelector("#workspaceList");

    const el =
      document.getElementById(
        "workspaceList"
      );

      if(!el) return;

      el.innerHTML = "";

    data.forEach(ws => {

      const item = document.createElement("div");
      item.className = "workspace-item";
      item.textContent = ws.name;

      item.onclick = () => {

        console.log("[WORKSPACE CLICK]", ws);

        // 🔥 IMPORTANT FIX: notify global app
        emitWorkspaceChange(ws);
      };

      list.appendChild(item);
    });

  } catch (err) {
    console.error("Workspace load failed:", err);
  }
}