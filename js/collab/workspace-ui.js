import { WorkspaceAPI } from "./workspace-api.js";
import { AuthStore } from "./auth-store.js";

export async function initWorkspaceUI() {

  if (!AuthStore.isLoggedIn()) return;

  const sidebar = document.getElementById("collectionList");
  if (!sidebar) {
    console.warn("Sidebar not found");
    return;
  }

  // ❗ CEGAH DUPLIKASI RENDER
  const existing = document.getElementById("workspaceSection");
  if (existing) existing.remove();

  const wrap = document.createElement("div");
  wrap.id = "workspaceSection";

  wrap.innerHTML = `
    <div class="workspace-header">
      <h3>Workspaces</h3>
      <button id="logoutBtn" style="margin-left:auto;">Logout</button>
    </div>

    <div id="workspaceList"></div>
  `;

  // inject paling atas sidebar
  sidebar.prepend(wrap);

  // ================= LOGOUT =================
  const logoutBtn = wrap.querySelector("#logoutBtn");

  logoutBtn.onclick = () => {
    AuthStore.logout();
  };

  // ================= LOAD WORKSPACE =================
  try {

    const data = await WorkspaceAPI.list();

    const list = wrap.querySelector("#workspaceList");

    list.innerHTML = "";

    data.forEach(ws => {

      const item = document.createElement("div");
      item.className = "workspace-item";

      item.textContent = ws.name;

      item.onclick = () => {
        console.log("workspace selected:", ws);
      };

      list.appendChild(item);
    });

  } catch (err) {
    console.error("Workspace load failed:", err);
  }
}